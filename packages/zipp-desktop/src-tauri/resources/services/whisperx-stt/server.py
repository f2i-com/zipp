"""
WhisperX Speech-to-Text Server

A local FastAPI server for speech recognition using WhisperX.
Provides word-level timestamps and optional speaker diarization.

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import io
import uuid
import tempfile
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from dotenv import load_dotenv

# Fix for PyTorch 2.6+ weights_only=True default
# WhisperX and pyannote models require weights_only=False
# Monkey-patch torch.load to ALWAYS use weights_only=False
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    # Force weights_only=False regardless of what's passed
    kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

# Load environment variables
load_dotenv()

# Configuration
HOST = os.getenv("WHISPERX_HOST", "127.0.0.1")
PORT = int(os.getenv("WHISPERX_PORT", "8770"))
DEVICE = os.getenv("WHISPERX_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MODEL_NAME = os.getenv("WHISPERX_MODEL", "large-v3")
COMPUTE_TYPE = os.getenv("WHISPERX_COMPUTE_TYPE", "float16" if DEVICE == "cuda" else "int8")
BATCH_SIZE = int(os.getenv("WHISPERX_BATCH_SIZE", "16"))
OUTPUT_DIR = os.getenv("WHISPERX_OUTPUT_DIR") or tempfile.gettempdir()
HF_TOKEN = os.getenv("HF_TOKEN", "")

# Global model instances
whisper_model = None
align_models = {}  # Language -> (model, metadata)
diarize_model = None


def load_whisper_model():
    """Load WhisperX model if not already loaded."""
    global whisper_model
    if whisper_model is not None:
        return whisper_model

    # Suppress pyannote import warnings since we may not need diarization
    import warnings
    warnings.filterwarnings("ignore", message=".*Pipeline.*")
    warnings.filterwarnings("ignore", message=".*pyannote.*")
    warnings.filterwarnings("ignore", category=UserWarning)

    import whisperx

    print(f"[WhisperX] Loading model '{MODEL_NAME}' on {DEVICE}...")
    whisper_model = whisperx.load_model(
        MODEL_NAME,
        device=DEVICE,
        compute_type=COMPUTE_TYPE
    )
    print(f"[WhisperX] Model loaded successfully")
    return whisper_model


def get_align_model(language: str):
    """Get alignment model for a specific language."""
    global align_models
    if language in align_models:
        return align_models[language]

    import whisperx

    print(f"[WhisperX] Loading alignment model for '{language}'...")
    model, metadata = whisperx.load_align_model(
        language_code=language,
        device=DEVICE
    )
    align_models[language] = (model, metadata)
    print(f"[WhisperX] Alignment model for '{language}' loaded")
    return model, metadata


def get_diarize_model(token: Optional[str] = None):
    """Get speaker diarization model.

    Args:
        token: HuggingFace token. If provided, creates a new pipeline.
               If None, uses the cached model or HF_TOKEN from env.
    """
    global diarize_model

    # Use provided token or fall back to env
    use_token = token if token else HF_TOKEN

    # If token is provided, we may need to recreate the model
    # (in case we want to support dynamic token switching)
    if diarize_model is not None and not token:
        return diarize_model

    if not use_token:
        raise ValueError("HuggingFace token required for speaker diarization. Set HF_TOKEN constant or .env")

    # Use whisperx's DiarizationPipeline wrapper (uses pyannote/speaker-diarization-3.1)
    from whisperx.diarize import DiarizationPipeline

    print(f"[WhisperX] Loading diarization model (token: {use_token[:8]}...)")
    diarize_model = DiarizationPipeline(
        use_auth_token=use_token,
        device=DEVICE
    )
    print("[WhisperX] Diarization model loaded successfully")
    return diarize_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup."""
    print(f"[WhisperX] Starting server on {HOST}:{PORT}")
    print(f"[WhisperX] Device: {DEVICE}")
    print(f"[WhisperX] Model: {MODEL_NAME}")
    print(f"[WhisperX] Compute type: {COMPUTE_TYPE}")
    print(f"[WhisperX] Output directory: {OUTPUT_DIR}")

    # Check if pyannote.audio is available
    pyannote_available = False
    try:
        import pyannote.audio
        pyannote_available = True
        print(f"[WhisperX] pyannote.audio: Available (v{pyannote.audio.__version__})")
    except ImportError as e:
        print(f"[WhisperX] pyannote.audio: Not installed ({e})")
    except Exception as e:
        print(f"[WhisperX] pyannote.audio: Error loading ({e})")

    # Speaker diarization requires both HF_TOKEN and pyannote
    if HF_TOKEN and pyannote_available:
        print(f"[WhisperX] Speaker diarization: Enabled (HF_TOKEN from env)")
    elif pyannote_available:
        print(f"[WhisperX] Speaker diarization: Available (HF_TOKEN can be passed via request)")
    else:
        print(f"[WhisperX] Speaker diarization: Disabled (pyannote.audio not available)")

    # Skip pre-loading - model will load on first transcription request
    # This avoids PyTorch 2.6+ weights_only warnings during startup
    print(f"[WhisperX] Model will load on first transcription request")

    yield

    # Cleanup
    print("[WhisperX] Shutting down...")
    global whisper_model, align_models, diarize_model
    whisper_model = None
    align_models = {}
    diarize_model = None
    torch.cuda.empty_cache() if torch.cuda.is_available() else None


app = FastAPI(
    title="WhisperX Speech-to-Text Server",
    description="Local STT server using WhisperX with word-level timestamps",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WordSegment(BaseModel):
    """A single word with timing."""
    word: str
    start: float
    end: float
    score: Optional[float] = None


class Segment(BaseModel):
    """A segment of transcribed speech."""
    start: float
    end: float
    text: str
    words: Optional[List[WordSegment]] = None
    speaker: Optional[str] = None

    @field_validator('speaker', mode='before')
    @classmethod
    def validate_speaker(cls, v):
        """Ensure speaker is None or a valid string - reject pyannote internal objects."""
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            # Reject strings that look like object representations
            if not v or v.startswith('{') or v.startswith('<') or v.startswith('['):
                return None
            return v
        # Anything that's not a string becomes None
        return None


class TranscriptionResult(BaseModel):
    """Complete transcription result."""
    success: bool
    language: str
    duration: float
    segments: List[Segment]
    text: str  # Full transcript text
    word_count: int
    message: Optional[str] = None


class TranscriptionRequest(BaseModel):
    """Request body for JSON transcription endpoint."""
    audio_path: str
    language: Optional[str] = None  # Auto-detect if not specified
    start_time: Optional[float] = None  # Start time in seconds
    end_time: Optional[float] = None  # End time in seconds
    enable_diarization: bool = False
    min_speakers: Optional[int] = None
    max_speakers: Optional[int] = None
    enable_word_timestamps: bool = True
    hf_token: Optional[str] = None  # HuggingFace token for diarization (overrides env)


def sanitize_speaker(speaker_value: Any) -> Optional[str]:
    """
    Sanitize speaker value from pyannote diarization.
    Only accepts valid string speaker IDs, returns None for anything else.
    """
    if speaker_value is None:
        return None

    if not isinstance(speaker_value, str):
        return None

    speaker_value = speaker_value.strip()
    if not speaker_value:
        return None

    # Reject strings that look like serialized objects
    if speaker_value.startswith('{') or speaker_value.startswith('<') or speaker_value.startswith('['):
        return None

    return speaker_value


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "status": "ok",
        "service": "WhisperX Speech-to-Text Server",
        "device": DEVICE,
        "model": MODEL_NAME,
        "cuda_available": torch.cuda.is_available()
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    missing = []

    # Check if whisperx is installed
    try:
        import whisperx
    except ImportError:
        missing.append("whisperx")

    # Check if ffmpeg is available
    import shutil
    if not shutil.which("ffmpeg"):
        missing.append("ffmpeg")

    if missing:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "missing": missing}
        )

    return {"status": "healthy", "device": DEVICE, "model": MODEL_NAME}


@app.post("/transcribe", response_model=TranscriptionResult)
async def transcribe_json(request: TranscriptionRequest):
    """
    Transcribe audio from a file path.
    """
    return await transcribe_audio(
        audio_path=request.audio_path,
        language=request.language,
        start_time=request.start_time,
        end_time=request.end_time,
        enable_diarization=request.enable_diarization,
        min_speakers=request.min_speakers,
        max_speakers=request.max_speakers,
        enable_word_timestamps=request.enable_word_timestamps,
        hf_token=request.hf_token
    )


@app.post("/transcribe/upload", response_model=TranscriptionResult)
async def transcribe_upload(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    start_time: Optional[float] = Form(None),
    end_time: Optional[float] = Form(None),
    enable_diarization: bool = Form(False),
    min_speakers: Optional[int] = Form(None),
    max_speakers: Optional[int] = Form(None),
    enable_word_timestamps: bool = Form(True),
    hf_token: Optional[str] = Form(None)
):
    """
    Transcribe uploaded audio file.
    """
    # Save uploaded file temporarily
    temp_path = os.path.join(OUTPUT_DIR, f"upload_{uuid.uuid4().hex}{Path(audio.filename).suffix}")

    try:
        content = await audio.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        return await transcribe_audio(
            audio_path=temp_path,
            language=language,
            start_time=start_time,
            end_time=end_time,
            enable_diarization=enable_diarization,
            min_speakers=min_speakers,
            max_speakers=max_speakers,
            enable_word_timestamps=enable_word_timestamps,
            hf_token=hf_token
        )
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


@app.post("/transcribe/segment", response_model=TranscriptionResult)
async def transcribe_segment(
    audio_path: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
    language: Optional[str] = Form(None),
    enable_word_timestamps: bool = Form(True)
):
    """
    Transcribe a specific segment of an audio/video file.
    Useful for processing long files in chunks.
    """
    return await transcribe_audio(
        audio_path=audio_path,
        language=language,
        start_time=start_time,
        end_time=end_time,
        enable_diarization=False,
        min_speakers=None,
        max_speakers=None,
        enable_word_timestamps=enable_word_timestamps
    )


async def transcribe_audio(
    audio_path: str,
    language: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    enable_diarization: bool = False,
    min_speakers: Optional[int] = None,
    max_speakers: Optional[int] = None,
    enable_word_timestamps: bool = True,
    hf_token: Optional[str] = None
) -> TranscriptionResult:
    """
    Core transcription function.
    """
    import whisperx

    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail=f"Audio file not found: {audio_path}")

    try:
        # Load the model
        model = load_whisper_model()

        print(f"[WhisperX] Transcribing: {audio_path}")
        if start_time is not None or end_time is not None:
            print(f"[WhisperX] Time range: {start_time or 0}s - {end_time or 'end'}s")

        # Load audio
        audio = whisperx.load_audio(audio_path)
        audio_duration = len(audio) / 16000  # WhisperX uses 16kHz

        # Handle time range extraction
        if start_time is not None or end_time is not None:
            start_sample = int((start_time or 0) * 16000)
            end_sample = int((end_time or audio_duration) * 16000)
            audio = audio[start_sample:end_sample]
            audio_duration = len(audio) / 16000

        # Transcribe
        result = model.transcribe(audio, batch_size=BATCH_SIZE, language=language)
        detected_language = result.get("language", language or "en")

        print(f"[WhisperX] Detected language: {detected_language}")

        # Align for word-level timestamps
        if enable_word_timestamps:
            try:
                align_model, metadata = get_align_model(detected_language)
                result = whisperx.align(
                    result["segments"],
                    align_model,
                    metadata,
                    audio,
                    DEVICE,
                    return_char_alignments=False
                )
            except Exception as e:
                print(f"[WhisperX] Warning: Alignment failed: {e}")

        # Speaker diarization
        if enable_diarization:
            try:
                diarize_pipeline = get_diarize_model(token=hf_token)
                print(f"[WhisperX] Running speaker diarization...")

                # whisperx DiarizationPipeline returns DataFrame directly
                diarize_df = diarize_pipeline(
                    audio_path,
                    min_speakers=min_speakers,
                    max_speakers=max_speakers
                )
                print(f"[WhisperX] Diarization found {len(diarize_df)} speaker segments")

                result = whisperx.assign_word_speakers(diarize_df, result)

                # Count unique speakers detected
                speakers = set()
                for seg in result.get("segments", []):
                    speaker = sanitize_speaker(seg.get("speaker"))
                    if speaker:
                        speakers.add(speaker)
                if speakers:
                    print(f"[WhisperX] Diarization complete: {len(speakers)} speaker(s) detected - {', '.join(sorted(speakers))}")
                else:
                    print(f"[WhisperX] Diarization complete: No distinct speakers identified (single speaker audio?)")
            except Exception as e:
                print(f"[WhisperX] Warning: Diarization failed: {e}")

        # Convert to response format
        segments = []
        full_text_parts = []
        word_count = 0

        for seg in result.get("segments", []):
            words = None
            if "words" in seg and enable_word_timestamps:
                words = []
                for w in seg["words"]:
                    # Skip words without timing info (can happen with alignment issues)
                    if "start" not in w or "end" not in w:
                        continue
                    words.append(WordSegment(
                        word=w.get("word", ""),
                        start=w.get("start", 0),
                        end=w.get("end", 0),
                        score=w.get("score")
                    ))
                word_count += len(words)

            # Adjust times if we had a start offset
            time_offset = start_time or 0

            # Get speaker value - only accept strings, everything else becomes None
            raw_speaker = seg.get("speaker")
            if raw_speaker is not None and isinstance(raw_speaker, str):
                speaker = raw_speaker.strip() if raw_speaker.strip() else None
            else:
                speaker = None

            segment = Segment(
                start=seg.get("start", 0) + time_offset,
                end=seg.get("end", 0) + time_offset,
                text=seg.get("text", "").strip(),
                words=words if words else None,
                speaker=speaker
            )
            segments.append(segment)
            full_text_parts.append(segment.text)

        full_text = " ".join(full_text_parts)

        print(f"[WhisperX] Transcription complete: {len(segments)} segments, {word_count} words")

        return TranscriptionResult(
            success=True,
            language=detected_language,
            duration=audio_duration,
            segments=segments,
            text=full_text,
            word_count=word_count
        )

    except Exception as e:
        print(f"[WhisperX] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models")
async def list_models():
    """List available Whisper models."""
    return {
        "available_models": [
            "tiny", "tiny.en",
            "base", "base.en",
            "small", "small.en",
            "medium", "medium.en",
            "large-v2", "large-v3"
        ],
        "current_model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE
    }


@app.get("/languages")
async def list_languages():
    """List supported languages for transcription."""
    return {
        "supported_languages": [
            "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr",
            "pl", "ca", "nl", "ar", "sv", "it", "id", "hi", "fi", "vi",
            "he", "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no",
            "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk",
            "te", "fa", "lv", "bn", "sr", "az", "sl", "kn", "et", "mk",
            "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw",
            "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc",
            "ka", "be", "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo",
            "ht", "ps", "tk", "nn", "mt", "sa", "lb", "my", "bo", "tl",
            "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su"
        ],
        "auto_detect": True,
        "note": "Leave language empty for auto-detection"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)

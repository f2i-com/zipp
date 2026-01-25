"""
Qwen3 TTS Server

A local FastAPI server for text-to-speech using Qwen3-TTS models.
Supports CustomVoice (predefined speakers) and VoiceDesign (custom voice descriptions).

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import uuid
import tempfile
from typing import Optional
from contextlib import asynccontextmanager

import torch
import soundfile as sf
import numpy as np
from fastapi import FastAPI, HTTPException, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Auto-detect best available device
def get_default_device():
    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return "mps"
    return "cpu"

# Configuration
HOST = os.getenv("QWEN3_HOST", "127.0.0.1")
PORT = int(os.getenv("QWEN3_PORT", "8772"))
DEVICE = os.getenv("QWEN3_DEVICE") or get_default_device()  # Empty string also triggers auto-detect
MODEL_TYPE = os.getenv("QWEN3_MODEL_TYPE", "custom_voice")  # custom_voice, voice_design, or base (for voice cloning)
DEFAULT_SPEAKER = os.getenv("QWEN3_DEFAULT_SPEAKER", "Vivian")
OUTPUT_DIR = os.getenv("QWEN3_OUTPUT_DIR") or tempfile.gettempdir()

# Models directory - default to local "models" folder relative to this script
# Falls back to HuggingFace download if local models not found
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.getenv("QWEN3_MODELS_DIR") or os.path.join(SCRIPT_DIR, "models")

# Available speakers for CustomVoice (from official Qwen3-TTS)
AVAILABLE_SPEAKERS = [
    "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric",
    "Ryan", "Aiden", "Ono_Anna", "Sohee"
]

# Supported languages (Qwen3-TTS supports 10 languages)
SUPPORTED_LANGUAGES = [
    "Auto", "Chinese", "English", "Japanese", "Korean",
    "French", "German", "Spanish", "Italian", "Portuguese", "Russian"
]

# Global model instances
models = {}


def load_model(model_type: str):
    """Load a Qwen3-TTS model if not already loaded.

    First checks for local models in MODELS_DIR, then falls back to HuggingFace.
    """
    if model_type in models:
        return models[model_type]

    print(f"[Qwen3-TTS] Loading {model_type} model on {DEVICE}...")

    from qwen_tts import Qwen3TTSModel

    # Determine dtype based on device
    # - CUDA: use bfloat16 for efficiency
    # - MPS (Apple Silicon): use float32 (bfloat16 not well supported)
    # - CPU: use float32
    if DEVICE == "cuda" or DEVICE.startswith("cuda:"):
        dtype = torch.bfloat16
    else:
        dtype = torch.float32

    # Try to use flash attention if available (CUDA only, reduces memory usage)
    attn_impl = "sdpa"  # Default to PyTorch's scaled dot product attention
    if DEVICE == "cuda" or DEVICE.startswith("cuda:"):
        try:
            import flash_attn
            attn_impl = "flash_attention_2"
            print(f"[Qwen3-TTS] Using Flash Attention 2")
        except ImportError:
            print(f"[Qwen3-TTS] Flash Attention not available, using SDPA")
    else:
        print(f"[Qwen3-TTS] Using SDPA attention (non-CUDA device)")

    # Determine device_map - use "auto" for CUDA, explicit device otherwise
    if DEVICE == "cuda":
        device_map = "cuda:0"
    elif DEVICE.startswith("cuda:"):
        device_map = DEVICE
    else:
        device_map = DEVICE  # "cpu" or "mps"

    # Check for local model first
    if model_type == "voice_design":
        local_model_name = "Qwen3-TTS-12Hz-1.7B-VoiceDesign"
    elif model_type == "base":
        local_model_name = "Qwen3-TTS-12Hz-1.7B-Base"
    else:
        local_model_name = "Qwen3-TTS-12Hz-1.7B-CustomVoice"
    local_model_path = os.path.join(MODELS_DIR, local_model_name)

    if os.path.exists(local_model_path) and os.path.isdir(local_model_path):
        # Check if config.json exists (indicates valid model directory)
        if os.path.exists(os.path.join(local_model_path, "config.json")):
            print(f"[Qwen3-TTS] Loading from local path: {local_model_path}")
            model_source = local_model_path
        else:
            print(f"[Qwen3-TTS] Local model directory incomplete, falling back to HuggingFace...")
            model_source = f"Qwen/{local_model_name}"
    else:
        print(f"[Qwen3-TTS] Local model not found at {local_model_path}")
        print(f"[Qwen3-TTS] Downloading from HuggingFace (this may take a while)...")
        model_source = f"Qwen/{local_model_name}"

    model = Qwen3TTSModel.from_pretrained(
        model_source,
        device_map=device_map,
        dtype=dtype,
        attn_implementation=attn_impl,
    )

    models[model_type] = model
    print(f"[Qwen3-TTS] {model_type} model loaded successfully")
    return model


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup."""
    print(f"[Qwen3-TTS] Starting server on {HOST}:{PORT}")
    print(f"[Qwen3-TTS] Device: {DEVICE}")
    print(f"[Qwen3-TTS] Model type: {MODEL_TYPE}")
    print(f"[Qwen3-TTS] Default speaker: {DEFAULT_SPEAKER}")
    print(f"[Qwen3-TTS] Models directory: {MODELS_DIR}")
    print(f"[Qwen3-TTS] Output directory: {OUTPUT_DIR}")

    # Pre-load the configured model type
    try:
        load_model(MODEL_TYPE)
    except Exception as e:
        print(f"[Qwen3-TTS] Warning: Failed to pre-load model: {e}")

    yield

    # Cleanup
    print("[Qwen3-TTS] Shutting down...")
    models.clear()
    torch.cuda.empty_cache() if torch.cuda.is_available() else None


app = FastAPI(
    title="Qwen3 TTS Server",
    description="Local TTS server using Qwen3-TTS models with voice design and custom voices",
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


class TTSRequest(BaseModel):
    """Request body for JSON TTS endpoint."""
    text: str
    model_type: Optional[str] = None  # custom_voice, voice_design, or voice_clone
    speaker: Optional[str] = None  # For CustomVoice: Vivian, Ryan, etc.
    description: Optional[str] = None  # Maps to 'instruct' parameter
    language: Optional[str] = None  # Auto, Chinese, English, etc.
    audio_prompt_path: Optional[str] = None  # For voice cloning: path to reference audio
    ref_text: Optional[str] = None  # For voice cloning: transcript of reference audio


class TTSResponse(BaseModel):
    """Response from TTS endpoint."""
    success: bool
    audio_path: str
    duration_ms: float
    sample_rate: int
    message: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint with model info."""
    return {
        "status": "ok",
        "service": "Qwen3 TTS Server",
        "device": DEVICE,
        "model_type": MODEL_TYPE,
        "default_speaker": DEFAULT_SPEAKER,
        "cuda_available": torch.cuda.is_available()
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "device": DEVICE}


@app.get("/speakers")
async def list_speakers():
    """List available speakers for CustomVoice model."""
    return {
        "speakers": AVAILABLE_SPEAKERS,
        "default": DEFAULT_SPEAKER
    }


@app.get("/languages")
async def list_languages():
    """List supported languages."""
    return {
        "languages": SUPPORTED_LANGUAGES
    }


@app.post("/tts", response_model=TTSResponse)
async def text_to_speech_json(request: TTSRequest):
    """
    Generate speech from text using JSON request body.

    For CustomVoice mode, specify a speaker name (e.g., "Ryan", "Vivian").
    For VoiceDesign mode, use description to design the voice.
    For VoiceClone mode, provide audio_prompt_path to clone a voice.
    """
    return await generate_speech(
        text=request.text,
        model_type=request.model_type,
        speaker=request.speaker,
        description=request.description,
        language=request.language,
        audio_prompt_path=request.audio_prompt_path,
        ref_text=request.ref_text
    )


@app.post("/tts/form", response_model=TTSResponse)
async def text_to_speech_form(
    text: str = Form(...),
    model_type: Optional[str] = Form(None),
    speaker: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    audio_prompt_path: Optional[str] = Form(None),
    ref_text: Optional[str] = Form(None)
):
    """
    Generate speech from text using form data.
    """
    return await generate_speech(
        text=text,
        model_type=model_type,
        speaker=speaker,
        description=description,
        language=language,
        audio_prompt_path=audio_prompt_path,
        ref_text=ref_text
    )


@app.post("/tts/file")
async def text_to_speech_file(
    text: str = Form(...),
    model_type: Optional[str] = Form(None),
    speaker: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    audio_prompt_path: Optional[str] = Form(None),
    ref_text: Optional[str] = Form(None)
):
    """
    Generate speech and return the audio file directly.

    Returns a WAV file response instead of JSON.
    """
    result = await generate_speech(
        text=text,
        model_type=model_type,
        speaker=speaker,
        description=description,
        language=language,
        audio_prompt_path=audio_prompt_path,
        ref_text=ref_text
    )

    return FileResponse(
        result.audio_path,
        media_type="audio/wav",
        filename=os.path.basename(result.audio_path)
    )


async def generate_speech(
    text: str,
    model_type: Optional[str] = None,
    speaker: Optional[str] = None,
    description: Optional[str] = None,
    language: Optional[str] = None,
    audio_prompt_path: Optional[str] = None,
    ref_text: Optional[str] = None
) -> TTSResponse:
    """
    Core speech generation function.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    # Use configured defaults
    model_type = model_type or MODEL_TYPE
    speaker = speaker or DEFAULT_SPEAKER
    language = language or "Auto"

    # If audio_prompt_path is provided, use voice cloning with base model
    if audio_prompt_path and os.path.exists(audio_prompt_path):
        model_type = "base"
        print(f"[Qwen3-TTS] Voice cloning mode: using base model with audio prompt")

    # Validate speaker for CustomVoice
    if model_type == "custom_voice" and speaker not in AVAILABLE_SPEAKERS:
        print(f"[Qwen3-TTS] Warning: Unknown speaker '{speaker}', using default '{DEFAULT_SPEAKER}'")
        speaker = DEFAULT_SPEAKER

    try:
        # Load the model
        model = load_model(model_type)

        # Generate output path
        output_path = os.path.join(OUTPUT_DIR, f"tts_{uuid.uuid4().hex}.wav")

        print(f"[Qwen3-TTS] Generating speech: '{text[:50]}...' (model: {model_type}, speaker: {speaker})")

        # Generate audio based on model type
        if model_type == "base" and audio_prompt_path and os.path.exists(audio_prompt_path):
            # Voice cloning mode - use reference audio to clone voice
            print(f"[Qwen3-TTS] Cloning voice from: {audio_prompt_path}")
            kwargs = {
                "text": text,
                "ref_audio": audio_prompt_path,
            }
            if language and language != "Auto":
                kwargs["language"] = language
            if ref_text:
                kwargs["ref_text"] = ref_text
            else:
                # If no ref_text provided, use x_vector_only_mode (lower quality but works without transcript)
                kwargs["x_vector_only_mode"] = True
                print(f"[Qwen3-TTS] No ref_text provided, using x_vector_only_mode")

            wavs, sr = model.generate_voice_clone(**kwargs)
        elif model_type == "voice_design":
            # VoiceDesign mode - use description to design the voice
            instruct = description or "A natural, clear voice with good pronunciation"
            wavs, sr = model.generate_voice_design(
                text=text,
                language=language if language != "Auto" else None,
                instruct=instruct
            )
        else:
            # CustomVoice mode - use predefined speakers
            kwargs = {
                "text": text,
                "speaker": speaker
            }
            if language and language != "Auto":
                kwargs["language"] = language
            if description:
                # Description can be used as instruct for emotion/tone
                kwargs["instruct"] = description

            wavs, sr = model.generate_custom_voice(**kwargs)

        # Handle the output format
        if isinstance(wavs, torch.Tensor):
            wav_np = wavs.squeeze().cpu().numpy()
        elif isinstance(wavs, list):
            wav_np = wavs[0].squeeze().cpu().numpy() if isinstance(wavs[0], torch.Tensor) else np.array(wavs[0])
        else:
            wav_np = np.array(wavs).squeeze()

        # Save the audio
        sf.write(output_path, wav_np, sr)

        # Calculate duration
        duration_ms = (len(wav_np) / sr) * 1000

        print(f"[Qwen3-TTS] Generated audio: {output_path} ({duration_ms:.0f}ms)")

        return TTSResponse(
            success=True,
            audio_path=output_path,
            duration_ms=duration_ms,
            sample_rate=sr
        )

    except Exception as e:
        print(f"[Qwen3-TTS] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models")
async def list_models():
    """List available model types."""
    return {
        "available_models": ["custom_voice", "voice_design"],
        "loaded_models": list(models.keys()),
        "current_default": MODEL_TYPE
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)

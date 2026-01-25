"""
Chatterbox TTS Server

A local FastAPI server for text-to-speech using ResembleAI's Chatterbox models.
Supports voice cloning via audio prompts.

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import io
import uuid
import tempfile
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

import torch
import torchaudio as ta
import soundfile as sf
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
HOST = os.getenv("CHATTERBOX_HOST", "127.0.0.1")
PORT = int(os.getenv("CHATTERBOX_PORT", "8765"))
DEVICE = os.getenv("CHATTERBOX_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MODEL_TYPE = os.getenv("CHATTERBOX_MODEL_TYPE", "turbo")  # turbo, standard, multilingual
OUTPUT_DIR = os.getenv("CHATTERBOX_OUTPUT_DIR") or tempfile.gettempdir()  # Handle empty string
DEFAULT_EXAGGERATION = float(os.getenv("CHATTERBOX_EXAGGERATION", "0.5"))
DEFAULT_CFG_WEIGHT = float(os.getenv("CHATTERBOX_CFG_WEIGHT", "0.5"))

# Global model instances
models = {}


def load_model(model_type: str):
    """Load a Chatterbox model if not already loaded."""
    if model_type in models:
        return models[model_type]

    print(f"[Chatterbox] Loading {model_type} model on {DEVICE}...")

    if model_type == "turbo":
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        model = ChatterboxTurboTTS.from_pretrained(device=DEVICE)
    elif model_type == "multilingual":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)
    else:  # standard
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device=DEVICE)

    models[model_type] = model
    print(f"[Chatterbox] {model_type} model loaded successfully")
    return model


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup."""
    print(f"[Chatterbox] Starting server on {HOST}:{PORT}")
    print(f"[Chatterbox] Device: {DEVICE}")
    print(f"[Chatterbox] Model type: {MODEL_TYPE}")
    print(f"[Chatterbox] Output directory: {OUTPUT_DIR}")

    # Pre-load the configured model type
    try:
        load_model(MODEL_TYPE)
    except Exception as e:
        print(f"[Chatterbox] Warning: Failed to pre-load model: {e}")

    yield

    # Cleanup
    print("[Chatterbox] Shutting down...")
    models.clear()
    torch.cuda.empty_cache() if torch.cuda.is_available() else None


app = FastAPI(
    title="Chatterbox TTS Server",
    description="Local TTS server using ResembleAI's Chatterbox models",
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
    model_type: Optional[str] = None  # turbo, standard, multilingual
    audio_prompt_path: Optional[str] = None
    language_id: Optional[str] = None  # For multilingual model
    exaggeration: Optional[float] = None
    cfg_weight: Optional[float] = None


class TTSResponse(BaseModel):
    """Response from TTS endpoint."""
    success: bool
    audio_path: str
    duration_ms: float
    sample_rate: int
    message: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "Chatterbox TTS Server",
        "device": DEVICE,
        "model_type": MODEL_TYPE,
        "cuda_available": torch.cuda.is_available()
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "device": DEVICE}


@app.post("/tts", response_model=TTSResponse)
async def text_to_speech_json(request: TTSRequest):
    """
    Generate speech from text using JSON request body.

    For voice cloning, provide audio_prompt_path pointing to a ~10 second reference clip.
    """
    return await generate_speech(
        text=request.text,
        model_type=request.model_type,
        audio_prompt_path=request.audio_prompt_path,
        language_id=request.language_id,
        exaggeration=request.exaggeration,
        cfg_weight=request.cfg_weight
    )


@app.post("/tts/form", response_model=TTSResponse)
async def text_to_speech_form(
    text: str = Form(...),
    model_type: Optional[str] = Form(None),
    audio_prompt_path: Optional[str] = Form(None),
    language_id: Optional[str] = Form(None),
    exaggeration: Optional[float] = Form(None),
    cfg_weight: Optional[float] = Form(None),
    audio_prompt: Optional[UploadFile] = File(None)
):
    """
    Generate speech from text using form data.

    Supports uploading an audio prompt file directly for voice cloning.
    """
    temp_audio_path = None

    try:
        # If an audio file was uploaded, save it temporarily
        if audio_prompt:
            temp_audio_path = os.path.join(OUTPUT_DIR, f"prompt_{uuid.uuid4().hex}.wav")
            content = await audio_prompt.read()
            with open(temp_audio_path, "wb") as f:
                f.write(content)
            audio_prompt_path = temp_audio_path

        return await generate_speech(
            text=text,
            model_type=model_type,
            audio_prompt_path=audio_prompt_path,
            language_id=language_id,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight
        )
    finally:
        # Clean up temporary audio file
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except:
                pass


@app.post("/tts/file")
async def text_to_speech_file(
    text: str = Form(...),
    model_type: Optional[str] = Form(None),
    audio_prompt_path: Optional[str] = Form(None),
    language_id: Optional[str] = Form(None),
    exaggeration: Optional[float] = Form(None),
    cfg_weight: Optional[float] = Form(None),
    audio_prompt: Optional[UploadFile] = File(None)
):
    """
    Generate speech and return the audio file directly.

    Returns a WAV file response instead of JSON.
    """
    temp_audio_path = None

    try:
        # If an audio file was uploaded, save it temporarily
        if audio_prompt:
            temp_audio_path = os.path.join(OUTPUT_DIR, f"prompt_{uuid.uuid4().hex}.wav")
            content = await audio_prompt.read()
            with open(temp_audio_path, "wb") as f:
                f.write(content)
            audio_prompt_path = temp_audio_path

        result = await generate_speech(
            text=text,
            model_type=model_type,
            audio_prompt_path=audio_prompt_path,
            language_id=language_id,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight
        )

        return FileResponse(
            result.audio_path,
            media_type="audio/wav",
            filename=os.path.basename(result.audio_path)
        )
    finally:
        # Clean up temporary audio file (but not the output)
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except:
                pass


async def generate_speech(
    text: str,
    model_type: Optional[str] = None,
    audio_prompt_path: Optional[str] = None,
    language_id: Optional[str] = None,
    exaggeration: Optional[float] = None,
    cfg_weight: Optional[float] = None
) -> TTSResponse:
    """
    Core speech generation function.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    # Use configured defaults
    model_type = model_type or MODEL_TYPE
    exaggeration = exaggeration if exaggeration is not None else DEFAULT_EXAGGERATION
    cfg_weight = cfg_weight if cfg_weight is not None else DEFAULT_CFG_WEIGHT

    try:
        # Load the model
        model = load_model(model_type)

        # Generate output path
        output_path = os.path.join(OUTPUT_DIR, f"tts_{uuid.uuid4().hex}.wav")

        print(f"[Chatterbox] Generating speech: '{text[:50]}...' (model: {model_type})")

        # Generate audio based on model type
        if model_type == "turbo":
            # Turbo model - requires audio prompt for voice cloning
            if audio_prompt_path and os.path.exists(audio_prompt_path):
                wav = model.generate(text, audio_prompt_path=audio_prompt_path)
            else:
                # Generate without voice cloning (uses default voice)
                wav = model.generate(text)
        elif model_type == "multilingual":
            # Multilingual model
            kwargs = {}
            if language_id:
                kwargs["language_id"] = language_id
            if audio_prompt_path and os.path.exists(audio_prompt_path):
                kwargs["audio_prompt_path"] = audio_prompt_path
            wav = model.generate(text, **kwargs)
        else:
            # Standard model
            kwargs = {}
            if audio_prompt_path and os.path.exists(audio_prompt_path):
                kwargs["audio_prompt_path"] = audio_prompt_path
            if hasattr(model, 'generate'):
                # Check if model supports exaggeration and cfg_weight
                import inspect
                sig = inspect.signature(model.generate)
                if 'exaggeration' in sig.parameters:
                    kwargs["exaggeration"] = exaggeration
                if 'cfg_weight' in sig.parameters:
                    kwargs["cfg_weight"] = cfg_weight
            wav = model.generate(text, **kwargs)

        # Save the audio using soundfile (avoids torchcodec dependency)
        wav_np = wav.squeeze().cpu().numpy()
        sf.write(output_path, wav_np, model.sr)

        # Calculate duration
        duration_ms = (len(wav_np) / model.sr) * 1000

        print(f"[Chatterbox] Generated audio: {output_path} ({duration_ms:.0f}ms)")

        return TTSResponse(
            success=True,
            audio_path=output_path,
            duration_ms=duration_ms,
            sample_rate=model.sr
        )

    except Exception as e:
        print(f"[Chatterbox] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models")
async def list_models():
    """List available model types."""
    return {
        "available_models": ["turbo", "standard", "multilingual"],
        "loaded_models": list(models.keys()),
        "current_default": MODEL_TYPE
    }


@app.get("/languages")
async def list_languages():
    """List supported languages for multilingual model."""
    return {
        "languages": {
            "ar": "Arabic",
            "da": "Danish",
            "de": "German",
            "el": "Greek",
            "en": "English",
            "es": "Spanish",
            "fi": "Finnish",
            "fr": "French",
            "he": "Hebrew",
            "hi": "Hindi",
            "it": "Italian",
            "ja": "Japanese",
            "ko": "Korean",
            "ms": "Malay",
            "nl": "Dutch",
            "no": "Norwegian",
            "pl": "Polish",
            "pt": "Portuguese",
            "ru": "Russian",
            "sv": "Swedish",
            "sw": "Swahili",
            "tr": "Turkish",
            "zh": "Chinese"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)

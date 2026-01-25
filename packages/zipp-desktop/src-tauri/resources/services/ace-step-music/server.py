"""
ACE-Step Music Generation Server

A local FastAPI server for music generation using ACE-Step.
Supports text-to-music generation with lyrics, tags, and various controls.

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import uuid
import tempfile
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Monkey-patch torchaudio.save to use soundfile directly
# This is needed because nightly torchaudio ignores the backend parameter
# and tries to use torchcodec which requires FFmpeg DLLs
def _patched_torchaudio_save(filepath, src, sample_rate, channels_first=True, format=None, backend=None, **kwargs):
    """Patched torchaudio.save that uses soundfile directly."""
    import soundfile as sf
    import numpy as np

    # Convert to numpy
    if hasattr(src, 'numpy'):
        data = src.numpy()
    else:
        data = np.array(src)

    # Handle channels_first: soundfile expects (samples, channels)
    if channels_first and data.ndim == 2:
        data = data.T  # Transpose to (samples, channels)
    elif data.ndim == 1:
        pass  # Mono audio

    # Ensure data is in valid range for float32
    data = np.clip(data, -1.0, 1.0).astype(np.float32)

    # Determine format from filepath if not specified
    if format is None:
        format = os.path.splitext(filepath)[1].lstrip('.').lower() or 'wav'

    # Use soundfile to save
    sf.write(filepath, data, sample_rate, format=format.upper())

# Apply the patch
import torchaudio
torchaudio._original_save = torchaudio.save
torchaudio.save = _patched_torchaudio_save

# Configuration
HOST = os.getenv("ACESTEP_HOST", "127.0.0.1")
PORT = int(os.getenv("ACESTEP_PORT", "8766"))
DEVICE = os.getenv("ACESTEP_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
DEVICE_ID = int(os.getenv("ACESTEP_DEVICE_ID", "0"))
USE_BF16 = os.getenv("ACESTEP_BF16", "true").lower() == "true"
TORCH_COMPILE = os.getenv("ACESTEP_TORCH_COMPILE", "false").lower() == "true"
CPU_OFFLOAD = os.getenv("ACESTEP_CPU_OFFLOAD", "false").lower() == "true"
CHECKPOINT_PATH = os.getenv("ACESTEP_CHECKPOINT_PATH", "")  # Empty = auto download
OUTPUT_DIR = os.getenv("ACESTEP_OUTPUT_DIR") or tempfile.gettempdir()

# Global pipeline instance
pipeline = None


def load_pipeline():
    """Load the ACE-Step pipeline."""
    global pipeline

    if pipeline is not None:
        return pipeline

    print(f"[ACE-Step] Loading pipeline on {DEVICE}:{DEVICE_ID}...")
    print(f"[ACE-Step] BF16: {USE_BF16}, Torch Compile: {TORCH_COMPILE}, CPU Offload: {CPU_OFFLOAD}")

    # Set CUDA device
    if DEVICE == "cuda":
        os.environ["CUDA_VISIBLE_DEVICES"] = str(DEVICE_ID)

    from acestep.pipeline_ace_step import ACEStepPipeline

    pipeline = ACEStepPipeline(
        checkpoint_dir=CHECKPOINT_PATH if CHECKPOINT_PATH else None,
        dtype="bfloat16" if USE_BF16 else "float32",
        torch_compile=TORCH_COMPILE,
        cpu_offload=CPU_OFFLOAD,
    )

    print("[ACE-Step] Pipeline loaded successfully")
    return pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize pipeline on startup."""
    print(f"[ACE-Step] Starting server on {HOST}:{PORT}")
    print(f"[ACE-Step] Device: {DEVICE}:{DEVICE_ID}")
    print(f"[ACE-Step] Output directory: {OUTPUT_DIR}")

    # Pre-load the pipeline
    try:
        load_pipeline()
    except Exception as e:
        print(f"[ACE-Step] Warning: Failed to pre-load pipeline: {e}")

    yield

    # Cleanup
    print("[ACE-Step] Shutting down...")
    global pipeline
    pipeline = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


app = FastAPI(
    title="ACE-Step Music Generation Server",
    description="Local music generation server using ACE-Step",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MusicGenRequest(BaseModel):
    """Request body for music generation."""
    # Content
    prompt: str = Field(..., description="Music description/tags (e.g., 'pop, energetic, female vocal')")
    lyrics: str = Field(default="", description="Song lyrics with structure markers like [verse], [chorus]")

    # Audio settings
    duration: float = Field(default=60.0, ge=10.0, le=240.0, description="Audio duration in seconds (10-240)")

    # Generation settings
    infer_steps: int = Field(default=27, ge=10, le=100, description="Number of inference steps")
    guidance_scale: float = Field(default=15.0, ge=1.0, le=30.0, description="Overall guidance scale")
    guidance_scale_text: float = Field(default=0.0, ge=0.0, le=10.0, description="Text guidance scale")
    guidance_scale_lyric: float = Field(default=0.0, ge=0.0, le=10.0, description="Lyric guidance scale")

    # Advanced settings
    scheduler_type: str = Field(default="euler", description="Scheduler type (euler, heun)")
    seed: Optional[int] = Field(default=None, description="Random seed for reproducibility")

    # ERG settings
    use_erg_tag: bool = Field(default=True, description="Use ERG for tags")
    use_erg_lyric: bool = Field(default=False, description="Use ERG for lyrics")
    use_erg_diffusion: bool = Field(default=True, description="Use ERG for diffusion")


class MusicGenResponse(BaseModel):
    """Response from music generation."""
    success: bool
    audio_path: str
    duration_seconds: float
    sample_rate: int
    message: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "ACE-Step Music Generation Server",
        "device": f"{DEVICE}:{DEVICE_ID}",
        "bf16": USE_BF16,
        "cuda_available": torch.cuda.is_available()
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "device": f"{DEVICE}:{DEVICE_ID}"}


@app.post("/generate", response_model=MusicGenResponse)
async def generate_music(request: MusicGenRequest):
    """
    Generate music from text prompt and optional lyrics.

    The prompt should describe the music style, genre, instruments, mood, etc.
    Lyrics can include structure markers like [verse], [chorus], [bridge].
    """
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    # Load pipeline if not loaded
    model = load_pipeline()

    # Generate output path
    output_filename = f"music_{uuid.uuid4().hex}.wav"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    print(f"[ACE-Step] Generating music: '{request.prompt[:50]}...'")
    print(f"[ACE-Step] Duration: {request.duration}s, Steps: {request.infer_steps}")

    # Set seed if provided
    seed = request.seed if request.seed is not None else -1

    # Generate music - catch errors but check if file was created anyway
    # (some optional post-processing like torchcodec may fail but audio is still saved)
    generation_error = None
    result = None
    try:
        result = model(
            prompt=request.prompt,
            lyrics=request.lyrics,
            audio_duration=request.duration,
            infer_step=request.infer_steps,
            guidance_scale=request.guidance_scale,
            guidance_scale_text=request.guidance_scale_text,
            guidance_scale_lyric=request.guidance_scale_lyric,
            scheduler_type=request.scheduler_type,
            use_erg_tag=request.use_erg_tag,
            use_erg_lyric=request.use_erg_lyric,
            use_erg_diffusion=request.use_erg_diffusion,
            manual_seeds=seed,
            save_path=output_path,
        )
    except Exception as e:
        generation_error = e
        print(f"[ACE-Step] Generation warning: {e}")

    # Check if output was created (might exist even if there was an error)
    # ACE-Step may save to a different path than what we specified
    import glob
    import time

    actual_path = None
    generation_time = time.time()

    if os.path.exists(output_path):
        actual_path = output_path
    elif isinstance(result, str) and os.path.exists(result):
        actual_path = result
    else:
        # Look for recently created music files in output dir
        pattern = os.path.join(OUTPUT_DIR, "music_*.wav")
        files = glob.glob(pattern)
        if files:
            # Get the most recently modified file
            files.sort(key=os.path.getmtime, reverse=True)
            newest_file = files[0]
            # Check if it was created recently (within last 60 seconds)
            if time.time() - os.path.getmtime(newest_file) < 60:
                actual_path = newest_file
                print(f"[ACE-Step] Found generated file: {actual_path}")

    if actual_path and os.path.exists(actual_path):
        print(f"[ACE-Step] Generated: {actual_path}")
        return MusicGenResponse(
            success=True,
            audio_path=actual_path,
            duration_seconds=request.duration,
            sample_rate=44100,  # ACE-Step outputs 44.1kHz
            message=f"Generated {request.duration}s of music"
        )

    # If we get here, no file was created
    error_msg = str(generation_error) if generation_error else "Output file was not created"
    print(f"[ACE-Step] Error: {error_msg}")
    raise HTTPException(status_code=500, detail=error_msg)


@app.post("/generate/file")
async def generate_music_file(request: MusicGenRequest):
    """
    Generate music and return the audio file directly.
    """
    result = await generate_music(request)

    if not os.path.exists(result.audio_path):
        raise HTTPException(status_code=500, detail="Generated file not found")

    return FileResponse(
        result.audio_path,
        media_type="audio/wav",
        filename=os.path.basename(result.audio_path)
    )


@app.get("/info")
async def model_info():
    """Get model information and capabilities."""
    return {
        "model": "ACE-Step-v1-3.5B",
        "capabilities": [
            "text-to-music",
            "lyrics-to-music",
            "instrumental",
            "vocal"
        ],
        "supported_genres": [
            "pop", "rock", "electronic", "hip-hop", "r&b", "jazz",
            "classical", "folk", "country", "metal", "ambient"
        ],
        "max_duration_seconds": 240,
        "default_sample_rate": 44100,
        "supported_languages": [
            "English", "Mandarin", "Russian", "Spanish", "Japanese",
            "German", "French", "Portuguese", "Italian", "Korean"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)

"""
Video Avatar Server

A local FastAPI server for audio-driven talking head generation using Ditto.
Generates lip-synced video from a reference image and audio.

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import sys
import uuid
import tempfile
import shutil
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
HOST = os.getenv("VIDEO_AVATAR_HOST", "127.0.0.1")
PORT = int(os.getenv("VIDEO_AVATAR_PORT", "8768"))
DEVICE = os.getenv("VIDEO_AVATAR_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
OUTPUT_DIR = os.getenv("VIDEO_AVATAR_OUTPUT_DIR") or tempfile.gettempdir()
DEFAULT_SAMPLING_TIMESTEPS = int(os.getenv("VIDEO_AVATAR_SAMPLING_TIMESTEPS", "50"))

# Use bundled ditto folder in the same directory as this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DITTO_PATH = os.path.join(SCRIPT_DIR, "ditto")
CHECKPOINTS_PATH = os.path.join(SCRIPT_DIR, "checkpoints")

# Add Ditto to path
sys.path.insert(0, DITTO_PATH)

# Global SDK instance
sdk = None


def check_models_exist():
    """Check if all required model files exist."""
    required_files = [
        os.path.join(CHECKPOINTS_PATH, "ditto_pytorch", "models", "appearance_extractor.pth"),
        os.path.join(CHECKPOINTS_PATH, "ditto_pytorch", "models", "decoder.pth"),
        os.path.join(CHECKPOINTS_PATH, "ditto_pytorch", "models", "lmdm_v0.4_hubert.pth"),
        os.path.join(CHECKPOINTS_PATH, "ditto_pytorch", "models", "motion_extractor.pth"),
        os.path.join(CHECKPOINTS_PATH, "ditto_pytorch", "models", "stitch_network.pth"),
        os.path.join(CHECKPOINTS_PATH, "ditto_pytorch", "models", "warp_network.pth"),
        os.path.join(CHECKPOINTS_PATH, "ditto_pytorch", "aux_models", "hubert_streaming_fix_kv.onnx"),
        os.path.join(CHECKPOINTS_PATH, "ditto_cfg", "v0.4_hubert_cfg_pytorch.pkl"),
    ]
    for f in required_files:
        if not os.path.exists(f):
            return False
    return True


def load_ditto():
    """Load Ditto SDK if not already loaded."""
    global sdk
    if sdk is not None:
        return sdk

    print(f"[Video Avatar] Loading Ditto from {DITTO_PATH}...")
    print(f"[Video Avatar] Checkpoints from {CHECKPOINTS_PATH}...")
    print(f"[Video Avatar] Device: {DEVICE}")

    # Check if models exist
    if not check_models_exist():
        raise FileNotFoundError(
            f"Ditto models not found. Please run the start script to download them, "
            f"or manually download from HuggingFace (YueMafworker/Ditto) to {CHECKPOINTS_PATH}"
        )

    try:
        from stream_pipeline_offline import StreamSDK

        data_root = os.path.join(CHECKPOINTS_PATH, "ditto_pytorch")
        cfg_pkl = os.path.join(CHECKPOINTS_PATH, "ditto_cfg", "v0.4_hubert_cfg_pytorch.pkl")

        if not os.path.exists(data_root):
            raise FileNotFoundError(f"Ditto models not found at {data_root}")
        if not os.path.exists(cfg_pkl):
            raise FileNotFoundError(f"Ditto config not found at {cfg_pkl}")

        sdk = StreamSDK(cfg_pkl, data_root)
        print("[Video Avatar] Ditto SDK loaded successfully")
        return sdk
    except Exception as e:
        print(f"[Video Avatar] Failed to load Ditto: {e}")
        raise


def run_ditto(sdk, audio_path: str, source_path: str, output_path: str):
    """Run Ditto inference."""
    import librosa
    import math

    # Load audio
    audio, sr = librosa.core.load(audio_path, sr=16000)
    num_f = math.ceil(len(audio) / 16000 * 25)

    # Setup
    sdk.setup(source_path, output_path)
    sdk.setup_Nd(N_d=num_f, fade_in=-1, fade_out=-1, ctrl_info={})

    # Run audio to motion
    aud_feat = sdk.wav2feat.wav2feat(audio)
    sdk.audio2motion_queue.put(aud_feat)
    sdk.close()

    return sdk.tmp_output_path


def add_audio_to_video(video_path: str, audio_path: str, output_path: str):
    """Add audio to video using ffmpeg."""
    import subprocess

    # Find ffmpeg from imageio-ffmpeg
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ffmpeg_path = "ffmpeg"

    cmd = [
        ffmpeg_path,
        "-loglevel", "error",
        "-y",
        "-i", video_path,
        "-i", audio_path,
        "-map", "0:v",
        "-map", "1:a",
        "-c:v", "copy",
        "-c:a", "aac",
        output_path
    ]

    subprocess.run(cmd, check=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize Ditto on startup."""
    print(f"[Video Avatar] Starting server on {HOST}:{PORT}")
    print(f"[Video Avatar] Device: {DEVICE}")
    print(f"[Video Avatar] Output directory: {OUTPUT_DIR}")

    # Pre-load Ditto
    try:
        load_ditto()
    except Exception as e:
        print(f"[Video Avatar] Warning: Failed to pre-load Ditto: {e}")

    yield

    # Cleanup
    print("[Video Avatar] Shutting down...")
    global sdk
    sdk = None
    torch.cuda.empty_cache() if torch.cuda.is_available() else None


app = FastAPI(
    title="Video Avatar Server",
    description="Local video avatar server using Ditto for talking head generation",
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


class AvatarRequest(BaseModel):
    """Request body for JSON avatar generation endpoint."""
    image_path: str
    audio_path: str
    output_filename: Optional[str] = None


class AvatarResponse(BaseModel):
    """Response from avatar generation endpoint."""
    success: bool
    video_path: str
    duration_ms: float
    message: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "Video Avatar Server",
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "ditto_loaded": sdk is not None
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "device": DEVICE, "ditto_loaded": sdk is not None}


@app.post("/generate", response_model=AvatarResponse)
async def generate_avatar_json(request: AvatarRequest):
    """
    Generate talking head video from image and audio using JSON request body.
    """
    return await generate_avatar(
        image_path=request.image_path,
        audio_path=request.audio_path,
        output_filename=request.output_filename
    )


@app.post("/generate/form", response_model=AvatarResponse)
async def generate_avatar_form(
    image_path: str = Form(None),
    audio_path: str = Form(None),
    output_filename: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None)
):
    """
    Generate talking head video using form data.

    Supports either file paths or uploaded files.
    """
    temp_image_path = None
    temp_audio_path = None

    try:
        # If files were uploaded, save them temporarily
        if image:
            temp_image_path = os.path.join(OUTPUT_DIR, f"img_{uuid.uuid4().hex}.png")
            content = await image.read()
            with open(temp_image_path, "wb") as f:
                f.write(content)
            image_path = temp_image_path

        if audio:
            temp_audio_path = os.path.join(OUTPUT_DIR, f"aud_{uuid.uuid4().hex}.wav")
            content = await audio.read()
            with open(temp_audio_path, "wb") as f:
                f.write(content)
            audio_path = temp_audio_path

        return await generate_avatar(
            image_path=image_path,
            audio_path=audio_path,
            output_filename=output_filename
        )
    finally:
        # Clean up temporary files
        for path in [temp_image_path, temp_audio_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except:
                    pass


@app.post("/generate/file")
async def generate_avatar_file(
    image_path: str = Form(None),
    audio_path: str = Form(None),
    output_filename: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None)
):
    """
    Generate talking head video and return the video file directly.
    """
    temp_image_path = None
    temp_audio_path = None

    try:
        # If files were uploaded, save them temporarily
        if image:
            temp_image_path = os.path.join(OUTPUT_DIR, f"img_{uuid.uuid4().hex}.png")
            content = await image.read()
            with open(temp_image_path, "wb") as f:
                f.write(content)
            image_path = temp_image_path

        if audio:
            temp_audio_path = os.path.join(OUTPUT_DIR, f"aud_{uuid.uuid4().hex}.wav")
            content = await audio.read()
            with open(temp_audio_path, "wb") as f:
                f.write(content)
            audio_path = temp_audio_path

        result = await generate_avatar(
            image_path=image_path,
            audio_path=audio_path,
            output_filename=output_filename
        )

        return FileResponse(
            result.video_path,
            media_type="video/mp4",
            filename=os.path.basename(result.video_path)
        )
    finally:
        # Clean up temporary files (but not the output)
        for path in [temp_image_path, temp_audio_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except:
                    pass


async def generate_avatar(
    image_path: str,
    audio_path: str,
    output_filename: Optional[str] = None
) -> AvatarResponse:
    """
    Core avatar generation function.
    """
    if not image_path or not os.path.exists(image_path):
        raise HTTPException(status_code=400, detail=f"Image file not found: {image_path}")

    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=400, detail=f"Audio file not found: {audio_path}")

    try:
        # Load Ditto SDK
        ditto_sdk = load_ditto()

        # Generate output path
        if output_filename:
            output_path = os.path.join(OUTPUT_DIR, output_filename)
        else:
            output_path = os.path.join(OUTPUT_DIR, f"avatar_{uuid.uuid4().hex}.mp4")

        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        print(f"[Video Avatar] Generating avatar video...")
        print(f"[Video Avatar] Image: {image_path}")
        print(f"[Video Avatar] Audio: {audio_path}")

        # Run Ditto to generate video without audio
        temp_video_path = run_ditto(ditto_sdk, audio_path, image_path, output_path)

        # Add audio to the generated video
        print(f"[Video Avatar] Adding audio to video...")
        add_audio_to_video(temp_video_path, audio_path, output_path)

        # Clean up temporary video
        if os.path.exists(temp_video_path) and temp_video_path != output_path:
            try:
                os.remove(temp_video_path)
            except:
                pass

        # Get video duration (approximate from audio)
        import librosa
        audio_data, sr = librosa.core.load(audio_path, sr=16000)
        duration_ms = (len(audio_data) / sr) * 1000

        print(f"[Video Avatar] Generated video: {output_path} ({duration_ms:.0f}ms)")

        return AvatarResponse(
            success=True,
            video_path=output_path,
            duration_ms=duration_ms
        )

    except Exception as e:
        print(f"[Video Avatar] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/status")
async def status():
    """Get server status and GPU info."""
    gpu_info = {}
    if torch.cuda.is_available():
        gpu_info = {
            "name": torch.cuda.get_device_name(0),
            "memory_total": torch.cuda.get_device_properties(0).total_memory / 1024**3,
            "memory_allocated": torch.cuda.memory_allocated() / 1024**3,
            "memory_reserved": torch.cuda.memory_reserved() / 1024**3,
        }

    return {
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "ditto_loaded": sdk is not None,
        "gpu": gpu_info
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)

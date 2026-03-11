"""
Wan2GP API Server for Zipp

FastAPI server that wraps Wan2GP's CLI mode, providing clean REST endpoints
for image generation and video generation. Uses wgp.py --process subprocess
for reliable model downloading and generation (bypasses broken Gradio session state).
"""

import os
import sys
import json
import time
import shutil
import base64
import logging
import asyncio
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Load environment
load_dotenv()

HOST = os.getenv("WAN2GP_HOST", "127.0.0.1")
PORT = int(os.getenv("ZIPP_SERVICE_PORT", os.getenv("WAN2GP_PORT", "8773")))
WAN2GP_PATH = os.getenv("WAN2GP_PATH", os.path.join(os.path.dirname(__file__), "Wan2GP"))
OUTPUT_DIR = os.getenv("WAN2GP_OUTPUT_DIR", os.path.join(os.path.dirname(__file__), "outputs"))
PROFILE = os.getenv("WAN2GP_PROFILE", "4")
ATTENTION = os.getenv("WAN2GP_ATTENTION", "sdpa")

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("wan2gp-server")

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)


# =============================================================================
# GLOBAL STATE
# =============================================================================

generation_lock = threading.Lock()
active_subprocess = None  # Track running subprocess for cleanup

# Job tracking for async generation
jobs: dict = {}  # { job_id: { status, result, error, started_at, completed_at, type } }
JOB_TTL_SECONDS = 3600  # Clean up completed/failed jobs after 1 hour

# Map of model IDs to Wan2GP model families/types
MODEL_MAP = {
    # Image models
    "qwen": "qwen_image_20B",
    "qwen_image_20B": "qwen_image_20B",
    "qwen_edit": "qwen_image_edit_plus_20B",
    "flux": "flux_dev",
    "flux_dev": "flux_dev",
    "flux_schnell": "flux_schnell",
    # Video models
    "wan_t2v_14b": "t2v",
    "wan_t2v_1_3b": "t2v_1.3B",
    "wan_i2v_480p": "i2v",
    "wan_i2v_720p": "i2v",
    "wan_t2v_2_2": "t2v_2_2",
    "t2v": "t2v",
    "ltx2_22B": "ltx2_22B",
    "ltx2_19B": "ltx2_19B",
    "ltx2_distilled": "ltx2_22B_distilled",
    "ltx2_22B_distilled": "ltx2_22B_distilled",
    "hunyuan_t2v": "hunyuan_t2v",
}

# Base resolutions available in Wan2GP
RESOLUTIONS = [
    (1280, 720), (720, 1280), (1024, 576), (576, 1024),
    (832, 624), (624, 832), (720, 720), (832, 480), (480, 832), (512, 512),
]


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class ImageGenRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 20
    seed: int = -1
    model: str = ""
    image_start: Optional[str] = None
    vram: Optional[int] = None

class VideoGenRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 832
    height: int = 480
    frames: int = 0          # Number of frames (0 = compute from duration)
    fps: int = 24
    steps: int = 20
    seed: int = -1
    model: str = ""
    duration: float = 0      # Duration in seconds (0 = use frames)
    image_start: Optional[str] = None
    image_end: Optional[str] = None
    audio_guide: Optional[str] = None
    vram: Optional[int] = None


# =============================================================================
# UTILITIES
# =============================================================================

def find_closest_resolution(w: int, h: int) -> str:
    """Find the closest Wan2GP resolution string."""
    best = min(RESOLUTIONS, key=lambda r: abs(r[0] - w) + abs(r[1] - h))
    return f"{best[0]}x{best[1]}"


def _vram_to_profile(vram_gb: int) -> int:
    """Map VRAM GB to Wan2GP profile number."""
    if vram_gb <= 6:
        return 1
    elif vram_gb <= 8:
        return 2
    elif vram_gb <= 10:
        return 3
    elif vram_gb <= 12:
        return 4
    elif vram_gb <= 16:
        return 5
    else:
        return 5  # Profile 5 is max (16GB+), 6 causes "Unknown profile" crash


def _save_base64_image(data_url: str, output_path: str) -> str:
    """Save a base64 data URL to a file."""
    if data_url.startswith("data:"):
        header, b64data = data_url.split(",", 1)
    else:
        b64data = data_url
    img_bytes = base64.b64decode(b64data)
    with open(output_path, "wb") as f:
        f.write(img_bytes)
    return output_path


def _read_file_as_base64(path: str, mime_type: str = "image/png") -> str:
    """Read a file and return as base64 data URL."""
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime_type};base64,{b64}"


def _scan_output_files(directory: str, exclude_extensions: set = None) -> list:
    """Scan a directory for output files, sorted by modification time (newest first)."""
    if exclude_extensions is None:
        exclude_extensions = {".json", ".txt", ".log"}
    files = []
    if not os.path.isdir(directory):
        return files
    for f in os.listdir(directory):
        fp = os.path.join(directory, f)
        ext = Path(f).suffix.lower()
        if os.path.isfile(fp) and ext not in exclude_extensions:
            files.append(fp)
    files.sort(key=os.path.getmtime, reverse=True)
    return files


def _cleanup_old_jobs():
    """Remove jobs older than JOB_TTL_SECONDS."""
    now = time.time()
    expired = [jid for jid, j in jobs.items()
               if j.get("completed_at") and (now - j["completed_at"]) > JOB_TTL_SECONDS]
    for jid in expired:
        del jobs[jid]


# =============================================================================
# GENERATION VIA CLI SUBPROCESS
# =============================================================================

def _run_generation_subprocess(
    model_type: str,
    prompt: str,
    negative_prompt: str = "",
    resolution: str = "832x480",
    video_length: int = 81,
    steps: int = 30,
    seed: int = -1,
    guidance_scale: float = 5.0,
    image_start_path: str = None,
    image_end_path: str = None,
    audio_guide_path: str = None,
    vram_gb: int = None,
) -> list:
    """
    Run generation via wgp.py --process CLI mode.

    Creates a settings JSON file and runs Wan2GP as a subprocess.
    This approach:
    - Automatically downloads models on first use (via Wan2GP's internal download_models)
    - Uses Wan2GP's validated CLI pipeline (no broken Gradio session state)
    - Handles all model loading, generation, and output saving
    """
    global active_subprocess

    wgp_script = os.path.join(WAN2GP_PATH, "wgp.py")
    if not os.path.isfile(wgp_script):
        raise RuntimeError(f"wgp.py not found at {wgp_script}")

    # Create job-specific output directory
    job_id = str(uuid.uuid4())[:8]
    job_dir = os.path.join(OUTPUT_DIR, f"job_{job_id}")
    os.makedirs(job_dir, exist_ok=True)

    # Build settings dict - only override what we need, Wan2GP applies defaults
    settings = {
        "model_type": model_type,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "resolution": resolution,
        "video_length": video_length,
        "num_inference_steps": steps,
        "seed": seed,
        "guidance_scale": guidance_scale,
    }

    # Note: override_profile is intentionally NOT set in settings.
    # The CLI --profile flag (from PROFILE env var) handles VRAM management.
    # mmgp profiles are: 1=6GB, 2=8GB, 3=10GB, 4=12GB, 5=16GB+
    # Setting an invalid profile (e.g. 6) causes "Unknown profile" crash.

    # Handle image inputs (filesystem paths for CLI mode)
    if image_start_path:
        settings["image_start"] = [image_start_path]
        settings["image_prompt_type"] = "SE" if image_end_path else "S"
    if image_end_path:
        settings["image_end"] = [image_end_path]
        if not image_start_path:
            settings["image_prompt_type"] = "E"

    if audio_guide_path:
        settings["audio_guide"] = audio_guide_path

    # Write settings to temp file
    settings_path = os.path.join(job_dir, "settings.json")
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)

    # Build subprocess command
    cmd = [
        sys.executable, os.path.abspath(wgp_script),
        "--process", settings_path,
        "--output-dir", job_dir,
        "--profile", str(PROFILE),
    ]
    if ATTENTION:
        cmd.extend(["--attention", ATTENTION])

    wan2gp_abs = os.path.abspath(WAN2GP_PATH)
    logger.info(f"[{job_id}] Starting generation: model={model_type}, resolution={resolution}, "
                f"frames={video_length}, steps={steps}, seed={seed}")
    logger.info(f"[{job_id}] Settings: {settings_path}")

    # Force unbuffered output so we see progress in real-time
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    # Run subprocess
    start_time = time.time()
    process = subprocess.Popen(
        cmd,
        cwd=wan2gp_abs,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,  # Line-buffered
        env=env,
    )
    active_subprocess = process

    # Stream stdout for logging (line by line)
    try:
        for line in iter(process.stdout.readline, ''):
            line = line.rstrip()
            if line:
                logger.info(f"[{job_id}] {line}")
            # Check if process has ended
            if process.poll() is not None:
                # Drain remaining output
                remaining = process.stdout.read()
                if remaining:
                    for rem_line in remaining.strip().split('\n'):
                        if rem_line.strip():
                            logger.info(f"[{job_id}] {rem_line.strip()}")
                break
    except Exception as e:
        logger.warning(f"[{job_id}] Error reading subprocess output: {e}")

    exit_code = process.wait()
    active_subprocess = None
    elapsed = time.time() - start_time
    logger.info(f"[{job_id}] Subprocess finished in {elapsed:.1f}s with exit code {exit_code}")

    if exit_code != 0:
        raise RuntimeError(f"Wan2GP generation failed (exit code {exit_code})")

    # Scan job directory for output files
    output_files = _scan_output_files(job_dir)
    logger.info(f"[{job_id}] Found {len(output_files)} output file(s)")

    # If no files in job dir, check Wan2GP's default outputs directory as fallback
    if not output_files:
        wan2gp_outputs = os.path.join(WAN2GP_PATH, "outputs")
        cutoff = start_time
        for f in os.listdir(wan2gp_outputs) if os.path.isdir(wan2gp_outputs) else []:
            fp = os.path.join(wan2gp_outputs, f)
            if os.path.isfile(fp) and os.path.getmtime(fp) > cutoff:
                output_files.append(fp)
        output_files.sort(key=os.path.getmtime, reverse=True)
        if output_files:
            logger.info(f"[{job_id}] Fallback: found {len(output_files)} file(s) in Wan2GP outputs")

    return output_files


def _run_job(job_id: str, gen_type: str, kwargs: dict):
    """
    Background worker: acquires generation_lock, runs subprocess, updates job status.
    gen_type is "image" or "video".
    """
    jobs[job_id]["status"] = "running"

    with generation_lock:
        try:
            files = _run_generation_subprocess(**kwargs)

            if not files:
                jobs[job_id]["status"] = "failed"
                jobs[job_id]["error"] = "No output files generated"
                jobs[job_id]["completed_at"] = time.time()
                return

            src = files[0]
            ext = Path(src).suffix

            if gen_type == "image":
                # Wan2GP outputs MP4 even for single-frame images - extract first frame
                if ext.lower() in ('.mp4', '.webm', '.avi', '.mov'):
                    import cv2
                    cap = cv2.VideoCapture(src)
                    ret, frame = cap.read()
                    cap.release()
                    if ret:
                        out_name = f"img_{job_id}.png"
                        out_path = os.path.join(OUTPUT_DIR, out_name)
                        cv2.imwrite(out_path, frame)
                        logger.info(f"[{job_id}] Extracted first frame from video -> {out_name}")
                    else:
                        raise RuntimeError("Failed to extract frame from video output")
                else:
                    out_name = f"img_{job_id}{ext or '.png'}"
                    out_path = os.path.join(OUTPUT_DIR, out_name)
                    if os.path.abspath(src) != os.path.abspath(out_path):
                        shutil.copy2(src, out_path)
                mime = "image/png"
                image_b64 = _read_file_as_base64(out_path, mime)
                jobs[job_id]["result"] = {"image": image_b64, "path": out_path}
            else:  # video
                out_name = f"vid_{job_id}{ext or '.mp4'}"
                out_path = os.path.join(OUTPUT_DIR, out_name)
                if os.path.abspath(src) != os.path.abspath(out_path):
                    shutil.copy2(src, out_path)
                jobs[job_id]["result"] = {
                    "video": f"http://127.0.0.1:{PORT}/output/{out_name}",
                    "path": out_path,
                }

            jobs[job_id]["status"] = "completed"
            jobs[job_id]["completed_at"] = time.time()

        except Exception as e:
            logger.error(f"[{job_id}] Generation failed: {e}")
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(e)
            jobs[job_id]["completed_at"] = time.time()


# =============================================================================
# LIFESPAN
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown."""
    logger.info(f"Wan2GP API server starting on {HOST}:{PORT}")
    wan2gp_installed = os.path.isdir(WAN2GP_PATH)
    wgp_script = os.path.join(WAN2GP_PATH, "wgp.py")

    if wan2gp_installed and os.path.isfile(wgp_script):
        logger.info(f"Wan2GP found at {WAN2GP_PATH}")
        logger.info(f"Using CLI --process mode (models download automatically on first use)")
        logger.info(f"Profile: {PROFILE}, Attention: {ATTENTION}")
    else:
        logger.warning(f"Wan2GP not found at {WAN2GP_PATH}")
        logger.info("Clone it with: git clone https://github.com/deepbeepmeep/Wan2GP")

    yield

    # Cleanup: kill any running subprocess
    global active_subprocess
    if active_subprocess and active_subprocess.poll() is None:
        logger.info("Stopping active generation subprocess...")
        active_subprocess.terminate()
        try:
            active_subprocess.wait(timeout=10)
        except subprocess.TimeoutExpired:
            active_subprocess.kill()
        active_subprocess = None


# =============================================================================
# FASTAPI APP
# =============================================================================

app = FastAPI(title="Wan2GP API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.get("/health")
async def health():
    wgp_script = os.path.join(WAN2GP_PATH, "wgp.py")
    return {
        "status": "healthy",
        "ready": os.path.isfile(wgp_script),
        "wan2gp_path": WAN2GP_PATH,
        "wan2gp_installed": os.path.isdir(WAN2GP_PATH),
        "mode": "cli-subprocess",
    }


@app.get("/")
async def root():
    return {
        "service": "Wan2GP",
        "version": "2.0.0",
        "status": "running",
        "ready": True,
        "capabilities": ["image_gen", "video_gen"],
    }


@app.get("/models")
async def list_models():
    """List available models."""
    return {
        "image": [
            {"id": "qwen", "name": "Qwen Image (20B)", "description": "Qwen 2.5 image generation"},
            {"id": "flux", "name": "Flux", "description": "Flux image generation"},
        ],
        "video": [
            {"id": "wan_t2v_14b", "name": "Wan 2.1 T2V 14B", "description": "Wan text-to-video 14B"},
            {"id": "wan_t2v_1_3b", "name": "Wan 2.1 T2V 1.3B", "description": "Low VRAM text-to-video"},
            {"id": "wan_i2v_480p", "name": "Wan 2.1 I2V 480p", "description": "Image-to-video 480p"},
            {"id": "wan_i2v_720p", "name": "Wan 2.1 I2V 720p", "description": "Image-to-video 720p"},
            {"id": "ltx2_22B", "name": "LTX Video 2.3 (22B)", "description": "LTX-2.3 text/image to video"},
            {"id": "ltx2_22B_distilled", "name": "LTX Video 2.3 Distilled (22B)", "description": "LTX-2.3 distilled (fast)"},
            {"id": "ltx2_19B", "name": "LTX Video 2 (19B)", "description": "LTX-2 text/image to video"},
            {"id": "hunyuan_t2v", "name": "Hunyuan Video T2V", "description": "Hunyuan text-to-video"},
        ],
    }


@app.post("/generate/image", status_code=202)
async def generate_image(req: ImageGenRequest):
    """Submit an image generation job (returns immediately with job_id)."""
    wgp_script = os.path.join(WAN2GP_PATH, "wgp.py")
    if not os.path.isfile(wgp_script):
        raise HTTPException(503, "Wan2GP is not installed.")

    _cleanup_old_jobs()

    job_id = str(uuid.uuid4())[:8]
    model = req.model or "qwen"
    model_type = MODEL_MAP.get(model, model)
    resolution = find_closest_resolution(req.width, req.height)

    # Handle image input for img2img (must save before thread starts)
    image_start_path = None
    if req.image_start:
        img_path = os.path.join(OUTPUT_DIR, f"input_{job_id}.png")
        _save_base64_image(req.image_start, img_path)
        image_start_path = img_path

    logger.info(f"[{job_id}] Image job submitted: model={model_type}, resolution={resolution}, "
                f"steps={req.steps}")

    if generation_lock.locked():
        raise HTTPException(409, "Another generation is already in progress.")

    jobs[job_id] = {
        "status": "queued",
        "result": None,
        "error": None,
        "started_at": time.time(),
        "completed_at": None,
        "type": "image",
    }

    kwargs = dict(
        model_type=model_type,
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        resolution=resolution,
        video_length=1,
        steps=req.steps,
        seed=req.seed,
        image_start_path=image_start_path,
        vram_gb=req.vram,
    )

    thread = threading.Thread(target=_run_job, args=(job_id, "image", kwargs), daemon=True)
    thread.start()

    return {"job_id": job_id}


@app.post("/generate/video", status_code=202)
async def generate_video(req: VideoGenRequest):
    """Submit a video generation job (returns immediately with job_id)."""
    wgp_script = os.path.join(WAN2GP_PATH, "wgp.py")
    if not os.path.isfile(wgp_script):
        raise HTTPException(503, "Wan2GP is not installed.")

    _cleanup_old_jobs()

    job_id = str(uuid.uuid4())[:8]
    model = req.model or "wan_t2v_14b"
    model_type = MODEL_MAP.get(model, model)
    resolution = find_closest_resolution(req.width, req.height)

    fps = req.fps or 24
    if req.duration > 0:
        frame_count = max(1, int(req.duration * fps))
    elif req.frames > 0:
        frame_count = req.frames
    else:
        frame_count = 5 * fps

    # Save all input files before thread starts
    image_start_path = None
    if req.image_start:
        img_path = os.path.join(OUTPUT_DIR, f"input_start_{job_id}.png")
        _save_base64_image(req.image_start, img_path)
        image_start_path = img_path

    image_end_path = None
    if req.image_end:
        img_path = os.path.join(OUTPUT_DIR, f"input_end_{job_id}.png")
        _save_base64_image(req.image_end, img_path)
        image_end_path = img_path

    audio_guide_path = None
    if req.audio_guide:
        if os.path.isfile(req.audio_guide):
            audio_guide_path = req.audio_guide
        elif req.audio_guide.startswith("data:"):
            audio_path = os.path.join(OUTPUT_DIR, f"audio_{job_id}.wav")
            _, b64data = req.audio_guide.split(",", 1)
            with open(audio_path, "wb") as f:
                f.write(base64.b64decode(b64data))
            audio_guide_path = audio_path

    logger.info(f"[{job_id}] Video job submitted: model={model_type}, resolution={resolution}, "
                f"frames={frame_count}, fps={fps}")

    if generation_lock.locked():
        raise HTTPException(409, "Another generation is already in progress.")

    jobs[job_id] = {
        "status": "queued",
        "result": None,
        "error": None,
        "started_at": time.time(),
        "completed_at": None,
        "type": "video",
    }

    kwargs = dict(
        model_type=model_type,
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        resolution=resolution,
        video_length=frame_count,
        steps=req.steps,
        seed=req.seed,
        image_start_path=image_start_path,
        image_end_path=image_end_path,
        audio_guide_path=audio_guide_path,
        vram_gb=req.vram,
    )

    thread = threading.Thread(target=_run_job, args=(job_id, "video", kwargs), daemon=True)
    thread.start()

    return {"job_id": job_id}


@app.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """Poll job status."""
    if job_id not in jobs:
        raise HTTPException(404, f"Job {job_id} not found")

    job = jobs[job_id]

    if job["status"] in ("queued", "running"):
        elapsed = time.time() - job["started_at"]
        return {"status": job["status"], "elapsed": round(elapsed, 1)}

    if job["status"] == "completed":
        return {"status": "completed", **job["result"]}

    if job["status"] == "failed":
        return {"status": "failed", "error": job["error"]}

    return {"status": job["status"]}


@app.get("/output/{filename:path}")
async def serve_output(filename: str):
    """Serve a generated output file."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.isfile(filepath):
        # Check in job subdirectories
        for d in os.listdir(OUTPUT_DIR):
            dp = os.path.join(OUTPUT_DIR, d)
            if os.path.isdir(dp):
                fp = os.path.join(dp, filename)
                if os.path.isfile(fp):
                    filepath = fp
                    break
        else:
            # Check Wan2GP outputs
            wan2gp_output = os.path.join(WAN2GP_PATH, "outputs", filename)
            if os.path.isfile(wan2gp_output):
                filepath = wan2gp_output
            else:
                raise HTTPException(404, f"File not found: {filename}")

    ext = Path(filepath).suffix.lower()
    media_types = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".gif": "image/gif",
        ".mp4": "video/mp4", ".webm": "video/webm",
    }
    return FileResponse(filepath, media_type=media_types.get(ext, "application/octet-stream"))


@app.post("/v1/chat/completions")
async def openai_compatible_chat(request: dict):
    """
    OpenAI-compatible chat completions endpoint.
    Wan2GP is a generation service, not a chat LLM. This endpoint passes through
    the user's prompt so workflows can use it as a connectivity/passthrough node.
    Use /generate/image or /generate/video for actual generation.
    """
    messages = request.get("messages", [])
    model = request.get("model", "qwen")

    user_prompt = ""
    for msg in messages:
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(
                    p.get("text", "") for p in content
                    if isinstance(p, dict) and p.get("type") == "text"
                )
            user_prompt = content

    if not user_prompt:
        raise HTTPException(400, "No user message found")

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": user_prompt},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": len(user_prompt.split()),
            "completion_tokens": len(user_prompt.split()),
            "total_tokens": len(user_prompt.split()) * 2,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")

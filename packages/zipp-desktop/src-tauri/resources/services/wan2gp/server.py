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

# =============================================================================
# MODEL CONFIG + GPU DETECTION
# =============================================================================

# Load models config
MODELS_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "models.json")
MODELS_CONFIG = {"image": [], "video": []}
if os.path.isfile(MODELS_CONFIG_PATH):
    with open(MODELS_CONFIG_PATH, "r", encoding="utf-8") as f:
        MODELS_CONFIG = json.load(f)
    logger.info(f"Loaded {len(MODELS_CONFIG.get('image', []))} image + "
                f"{len(MODELS_CONFIG.get('video', []))} video models from models.json")


def _detect_gpu_sm() -> int:
    """Detect GPU compute capability (SM version). Returns e.g. 89, 120, 0 if unknown."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=compute_cap", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            # e.g. "8.9" -> 89, "12.0" -> 120
            parts = result.stdout.strip().split("\n")[0].strip().split(".")
            return int(parts[0]) * 10 + int(parts[1]) if len(parts) == 2 else 0
    except Exception:
        pass
    return 0


GPU_SM = _detect_gpu_sm()
logger.info(f"GPU compute capability: sm_{GPU_SM}" if GPU_SM else "GPU: not detected")


def _detect_gpu_vram_gb() -> int:
    """Detect GPU VRAM in GB via nvidia-smi."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            mb = int(result.stdout.strip().split("\n")[0].strip())
            return mb // 1024
    except Exception:
        pass
    return 0


GPU_VRAM_GB = _detect_gpu_vram_gb()
logger.info(f"GPU VRAM: {GPU_VRAM_GB} GB" if GPU_VRAM_GB else "GPU VRAM: not detected")


def _resolve_model(model_id: str) -> str:
    """Resolve a model ID to an actual model_type, handling auto-resolve for nunchaku variants."""
    # Check models config for resolve rules
    for category in ("image", "video"):
        for m in MODELS_CONFIG.get(category, []):
            if m["id"] == model_id and "resolve" in m:
                if GPU_SM >= 120 and "sm120" in m["resolve"]:
                    resolved = m["resolve"]["sm120"]
                    logger.info(f"Model '{model_id}' -> '{resolved}' (sm_{GPU_SM} >= 120)")
                    return resolved
                resolved = m["resolve"]["default"]
                logger.info(f"Model '{model_id}' -> '{resolved}' (default)")
                return resolved
    # No resolve rule - use as-is
    return model_id

# Base resolutions available in Wan2GP
RESOLUTIONS = [
    (1024, 1024), (1280, 720), (720, 1280), (1024, 576), (576, 1024),
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
    sample_solver: Optional[str] = None

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
    """Map VRAM GB to Wan2GP mmgp profile number.

    Wan2GP profiles (from wgp.py memory_profile_choices):
      1  = HighRAM_HighVRAM   (64GB RAM, 24GB VRAM) - fastest
      2  = HighRAM_LowVRAM    (64GB RAM, 12GB VRAM)
      3  = LowRAM_HighVRAM    (32GB RAM, 24GB VRAM)
      4  = LowRAM_LowVRAM     (32GB RAM, 12GB VRAM) - recommended default
      5  = VeryLowRAM_LowVRAM (24GB RAM, 10GB VRAM) - failsafe/slowest

    We pick the most aggressive profile that fits the user's VRAM.
    For RAM we assume >=32GB (common for AI workloads); users with 64GB+
    and high VRAM get profile 1.
    """
    import psutil
    ram_gb = psutil.virtual_memory().total / (1024 ** 3)
    high_ram = ram_gb >= 56  # ~64GB threshold (allow some OS overhead)

    if vram_gb >= 24:
        return 1 if high_ram else 3       # HighVRAM
    elif vram_gb >= 12:
        return 2 if high_ram else 4       # LowVRAM
    elif vram_gb >= 10:
        return 5                          # Failsafe
    else:
        return 5                          # Very low VRAM


def _save_image_input(data: str, output_path: str) -> str:
    """Save an image input to a file. Handles base64 data URLs, HTTP URLs, and file paths."""
    if data.startswith("data:"):
        # Base64 data URL
        _header, b64data = data.split(",", 1)
        img_bytes = base64.b64decode(b64data)
        with open(output_path, "wb") as f:
            f.write(img_bytes)
    elif data.startswith(("http://", "https://")):
        # HTTP URL - check if it's a local server URL we can resolve to a file
        local_prefix = f"http://127.0.0.1:{PORT}/output/"
        local_prefix_alt = f"http://localhost:{PORT}/output/"
        if data.startswith(local_prefix) or data.startswith(local_prefix_alt):
            prefix = local_prefix if data.startswith(local_prefix) else local_prefix_alt
            filename = data[len(prefix):]
            src = os.path.join(OUTPUT_DIR, filename)
            if os.path.isfile(src):
                shutil.copy2(src, output_path)
                return output_path
        # Download from URL
        import urllib.request
        urllib.request.urlretrieve(data, output_path)
    elif os.path.isfile(data):
        # File path
        shutil.copy2(data, output_path)
    else:
        # Try as raw base64
        img_bytes = base64.b64decode(data)
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
    sample_solver: str = None,
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

    # Use model's recommended steps if client sent a generic default (20 for image, 30 for video)
    effective_steps = steps
    if steps in (20, 30) and model_config and "default_steps" in model_config:
        effective_steps = model_config["default_steps"]

    # Look up model-specific defaults from models.json
    # model_type may be resolved (e.g. "qwen_image_edit_plus_20B_nunchaku_r128_fp4")
    # so also check if any model's resolve values match
    model_config = None
    for category in ("image", "video"):
        for m in MODELS_CONFIG.get(category, []):
            if m["id"] == model_type:
                model_config = m
                break
            # Check if model_type is a resolved variant
            resolve = m.get("resolve", {})
            if model_type in resolve.values():
                model_config = m
                break

    # Build settings dict - only override what we need, Wan2GP applies defaults
    settings = {
        "model_type": model_type,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "resolution": resolution,
        "video_length": video_length,
        "num_inference_steps": effective_steps,
        "seed": seed,
    }

    # Only include guidance_scale if explicitly provided (not the default 5.0),
    # or if model config specifies one. Otherwise let Wan2GP's model defaults apply.
    if guidance_scale != 5.0:
        settings["guidance_scale"] = guidance_scale
    elif model_config and "default_guidance_scale" in model_config:
        settings["guidance_scale"] = model_config["default_guidance_scale"]
    # else: omit guidance_scale so Wan2GP model defaults take over

    # Pass sample_solver if specified (e.g. "lightning" for distilled models)
    if sample_solver:
        settings["sample_solver"] = sample_solver

    # Compute mmgp profile from VRAM:
    # - If vram_gb provided by request, use it
    # - If auto-detected GPU VRAM available, use it
    # - Otherwise fall back to global PROFILE env var
    if vram_gb is not None:
        profile = _vram_to_profile(vram_gb)
    elif GPU_VRAM_GB > 0:
        profile = _vram_to_profile(GPU_VRAM_GB)
    else:
        profile = int(PROFILE)

    # Handle image inputs (filesystem paths for CLI mode)
    # Qwen image edit models use image_refs (reference images) with video_prompt_type "I",
    # NOT image_start with image_prompt_type "S" (which is for video i2v models).
    is_qwen_edit = "qwen_image_edit" in model_type or "qwen_image_layered" in model_type
    if image_start_path:
        if is_qwen_edit:
            settings["image_refs"] = [image_start_path]
            settings["video_prompt_type"] = "I"
        else:
            settings["image_start"] = [image_start_path]
            settings["image_prompt_type"] = "SE" if image_end_path else "S"
    if image_end_path:
        settings["image_end"] = [image_end_path]
        if not image_start_path:
            settings["image_prompt_type"] = "E"

    if audio_guide_path:
        settings["audio_guide"] = audio_guide_path
        # audio_prompt_type "A" tells Wan2GP to use the audio_guide input
        settings["audio_prompt_type"] = settings.get("audio_prompt_type", "") + "A"

    # Write settings to temp file
    settings_path = os.path.join(job_dir, "settings.json")
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)

    # Build subprocess command
    cmd = [
        sys.executable, os.path.abspath(wgp_script),
        "--process", settings_path,
        "--output-dir", job_dir,
        "--profile", str(profile),
    ]
    if ATTENTION:
        cmd.extend(["--attention", ATTENTION])

    wan2gp_abs = os.path.abspath(WAN2GP_PATH)
    logger.info(f"[{job_id}] Starting generation: model={model_type}, resolution={resolution}, "
                f"frames={video_length}, steps={steps}, seed={seed}, profile={profile} (vram_gb={vram_gb})")
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
    """List available models from models.json config."""
    return {
        "image": MODELS_CONFIG.get("image", []),
        "video": MODELS_CONFIG.get("video", []),
        "gpu_sm": GPU_SM,
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
    model_type = _resolve_model(model)
    resolution = find_closest_resolution(req.width, req.height)

    # Handle image input for img2img (must save before thread starts)
    image_start_path = None
    if req.image_start:
        img_path = os.path.join(OUTPUT_DIR, f"input_{job_id}.png")
        _save_image_input(req.image_start, img_path)
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
        sample_solver=req.sample_solver,
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
    model = req.model or "ltx2_22B_distilled"
    model_type = _resolve_model(model)
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
        _save_image_input(req.image_start, img_path)
        image_start_path = img_path

    image_end_path = None
    if req.image_end:
        img_path = os.path.join(OUTPUT_DIR, f"input_end_{job_id}.png")
        _save_image_input(req.image_end, img_path)
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

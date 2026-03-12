"""
ACE-Step Music Generation Server

A local FastAPI server for music generation using ACE-Step.
Wraps the ACEStepPipeline with REST endpoints matching the expected API.

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import sys
import json
import time
import uuid
import logging
import threading
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Load environment variables
_script_dir = Path(__file__).parent
load_dotenv(_script_dir / ".env")

HOST = os.getenv("ACESTEP_HOST", os.getenv("HOST", "127.0.0.1"))
PORT = int(os.getenv("ZIPP_SERVICE_PORT", os.getenv("ACESTEP_PORT", "8766")))
CHECKPOINT_PATH = os.getenv("ACESTEP_CHECKPOINT_PATH", "")
OUTPUT_DIR = os.path.join(str(_script_dir), "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ace-step-server")

# =============================================================================
# GLOBAL STATE
# =============================================================================

pipeline = None  # Lazy-loaded ACEStepPipeline
pipeline_lock = threading.Lock()
pipeline_loading = False

# Job tracking: { task_id: { status: 0|1|2, result: str|None, error: str|None, started_at: float } }
jobs: dict = {}
JOB_TTL_SECONDS = 3600


# =============================================================================
# PIPELINE MANAGEMENT
# =============================================================================

def _save_wav_soundfile(self, target_wav, idx, save_path=None, sample_rate=48000, format="wav"):
    """Save audio using soundfile directly (avoids torchaudio TorchCodec dependency)."""
    import soundfile as sf

    if save_path is None:
        base_path = "./outputs"
        os.makedirs(base_path, exist_ok=True)
        output_path = f"{base_path}/output_{time.strftime('%Y%m%d%H%M%S')}_{idx}.{format}"
    elif os.path.isdir(save_path):
        output_path = os.path.join(save_path, f"output_{time.strftime('%Y%m%d%H%M%S')}_{idx}.{format}")
    else:
        output_path = save_path

    data = target_wav.cpu().float().numpy()
    if data.ndim == 2:
        data = data.T  # soundfile expects (samples, channels)
    logger.info(f"Saving audio to {output_path}")
    sf.write(output_path, data, sample_rate)
    return output_path


def _load_pipeline():
    """Load the ACE-Step pipeline (lazy, thread-safe)."""
    global pipeline, pipeline_loading
    if pipeline is not None:
        return pipeline

    with pipeline_lock:
        if pipeline is not None:
            return pipeline

        pipeline_loading = True
        logger.info("Loading ACE-Step pipeline...")

        from acestep.pipeline_ace_step import ACEStepPipeline
        pipeline = ACEStepPipeline(
            checkpoint_dir=CHECKPOINT_PATH or None,
            dtype="bfloat16",
            cpu_offload=False,
        )
        # Replace save method to use soundfile directly (torchaudio 2.9+ requires TorchCodec)
        import types
        pipeline.save_wav_file = types.MethodType(_save_wav_soundfile, pipeline)
        pipeline_loading = False
        logger.info("ACE-Step pipeline loaded successfully")
        return pipeline


# =============================================================================
# REQUEST MODELS
# =============================================================================

class ReleaseTaskRequest(BaseModel):
    prompt: str = ""
    lyrics: str = ""
    audio_duration: float = 60.0
    infer_step: int = 60
    guidance_scale: float = 15.0
    thinking: bool = False
    vocal_language: str = "en"
    seed: Optional[int] = None
    use_random_seed: bool = True
    scheduler_type: str = "euler"
    cfg_type: str = "apg"
    omega_scale: float = 10.0


class QueryResultRequest(BaseModel):
    task_id_list: list[str] = []


# =============================================================================
# GENERATION WORKER
# =============================================================================

def _run_generation(task_id: str, req: dict):
    """Background worker that runs ACE-Step generation."""
    try:
        pipe = _load_pipeline()

        # Build kwargs for pipeline.__call__
        kwargs = {
            "prompt": req.get("prompt", ""),
            "lyrics": req.get("lyrics", ""),
            "audio_duration": req.get("audio_duration", 60.0),
            "infer_step": req.get("infer_step", 60),
            "guidance_scale": req.get("guidance_scale", 15.0),
            "scheduler_type": req.get("scheduler_type", "euler"),
            "cfg_type": req.get("cfg_type", "apg"),
            "omega_scale": req.get("omega_scale", 10.0),
            "save_path": OUTPUT_DIR,
            "format": "wav",
            "batch_size": 1,
        }

        # Handle seed
        seed = req.get("seed")
        if seed is not None and seed >= 0 and not req.get("use_random_seed", True):
            kwargs["manual_seeds"] = [seed]

        logger.info(f"[{task_id}] Starting generation: duration={kwargs['audio_duration']}s, "
                    f"steps={kwargs['infer_step']}, guidance={kwargs['guidance_scale']}")

        # Run generation
        with pipeline_lock:
            output_paths = pipe(**kwargs)

        if not output_paths:
            jobs[task_id]["status"] = 2
            jobs[task_id]["result"] = json.dumps({"error": "No output generated"})
            return

        # Filter to audio files only (exclude the params JSON)
        audio_paths = [p for p in output_paths if isinstance(p, str) and p.endswith((".wav", ".mp3", ".flac"))]

        if not audio_paths:
            jobs[task_id]["status"] = 2
            jobs[task_id]["result"] = json.dumps({"error": "No audio files generated"})
            return

        # Build result matching expected format
        results = []
        for path in audio_paths:
            results.append({
                "file": path,
                "status": 1,
                "metas": {
                    "duration": req.get("audio_duration", 60.0),
                },
            })

        jobs[task_id]["status"] = 1
        jobs[task_id]["result"] = json.dumps(results)
        logger.info(f"[{task_id}] Generation complete: {len(audio_paths)} file(s)")

    except Exception as e:
        logger.error(f"[{task_id}] Generation failed: {e}")
        jobs[task_id]["status"] = 2
        jobs[task_id]["result"] = json.dumps({"error": str(e)})


def _cleanup_old_jobs():
    """Remove old completed/failed jobs."""
    now = time.time()
    expired = [tid for tid, j in jobs.items()
               if j.get("status") in (1, 2) and (now - j.get("started_at", now)) > JOB_TTL_SECONDS]
    for tid in expired:
        del jobs[tid]


# =============================================================================
# FASTAPI APP
# =============================================================================

app = FastAPI(title="ACE-Step Music Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "ready": pipeline is not None,
        "loading": pipeline_loading,
    }


@app.get("/")
async def root():
    return {
        "service": "ACE-Step Music",
        "version": "1.0.0",
        "status": "running",
        "ready": True,
    }


@app.post("/release_task")
async def release_task(req: ReleaseTaskRequest):
    """Submit a music generation task."""
    _cleanup_old_jobs()

    task_id = str(uuid.uuid4())[:8]
    jobs[task_id] = {
        "status": 0,  # 0 = pending
        "result": None,
        "started_at": time.time(),
    }

    logger.info(f"[{task_id}] Task submitted: prompt={req.prompt[:80]}...")

    thread = threading.Thread(
        target=_run_generation,
        args=(task_id, req.model_dump()),
        daemon=True,
    )
    thread.start()

    return {
        "data": {
            "task_id": task_id,
            "status": 0,
        },
        "code": 200,
    }


@app.post("/query_result")
async def query_result(req: QueryResultRequest):
    """Poll for task results."""
    results = []
    for task_id in req.task_id_list:
        if task_id not in jobs:
            results.append({
                "task_id": task_id,
                "status": 2,
                "result": json.dumps({"error": "Task not found"}),
            })
        else:
            job = jobs[task_id]
            results.append({
                "task_id": task_id,
                "status": job["status"],
                "result": job.get("result"),
            })

    return {"data": results, "code": 200}


@app.get("/v1/audio")
async def serve_audio(path: str):
    """Serve an audio file by path."""
    filepath = unquote(path)
    if not os.path.isfile(filepath):
        raise HTTPException(404, f"File not found: {filepath}")

    ext = Path(filepath).suffix.lower()
    media_types = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
    }
    return FileResponse(filepath, media_type=media_types.get(ext, "application/octet-stream"))


@app.get("/output/{filename:path}")
async def serve_output(filename: str):
    """Serve a file from the output directory."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(404, f"File not found: {filename}")

    ext = Path(filepath).suffix.lower()
    media_types = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
    }
    return FileResponse(filepath, media_type=media_types.get(ext, "application/octet-stream"))


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    print("=" * 40)
    print("  ACE-Step Music Generation Server")
    print("=" * 40)
    print(f"Host: {HOST}")
    print(f"Port: {PORT}")
    print("=" * 40)

    # Pre-load pipeline in background so first request is faster
    threading.Thread(target=_load_pipeline, daemon=True).start()

    uvicorn.run(app, host=HOST, port=int(PORT), log_level="info")

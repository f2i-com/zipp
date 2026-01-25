"""
Video Downloader Server

A local FastAPI server for downloading videos and extracting audio from online sources.
Uses yt-dlp (supports 1000+ sites including YouTube, Vimeo, Twitter, TikTok, etc.)
and ffmpeg for processing.

Supported sites: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import re
import uuid
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
HOST = os.getenv("VIDEODL_HOST", "127.0.0.1")
PORT = int(os.getenv("VIDEODL_PORT", "8771"))
OUTPUT_DIR = os.getenv("VIDEODL_OUTPUT_DIR") or tempfile.gettempdir()
SAMPLE_RATE = int(os.getenv("VIDEODL_SAMPLE_RATE", "44100"))

app = FastAPI(
    title="Video Downloader Server",
    description="Download videos and extract audio from YouTube, Vimeo, Twitter, TikTok, and 1000+ more sites",
    version="2.0.0",
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extract_video_id(url: str) -> str:
    """Extract a video ID from URL. Works for YouTube and creates hash for other sites."""
    # Try YouTube patterns first
    yt_patterns = [
        r"(?:youtu\.be\/)([A-Za-z0-9_-]{11})",
        r"(?:v=)([A-Za-z0-9_-]{11})",
        r"(?:\/embed\/)([A-Za-z0-9_-]{11})",
        r"(?:\/shorts\/)([A-Za-z0-9_-]{11})",
    ]
    for pat in yt_patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)

    # For other sites, create a short hash from the URL
    import hashlib
    return hashlib.md5(url.encode()).hexdigest()[:11]


def setup_paths():
    """Add ffmpeg and venv Scripts to PATH."""
    paths_to_add = []

    # Add venv Scripts folder for yt-dlp
    venv_scripts = Path(__file__).parent / "venv" / "Scripts"
    if venv_scripts.exists():
        paths_to_add.append(str(venv_scripts))
        print(f"[Video DL] Added venv Scripts to PATH")

    # Check common locations for ffmpeg
    ffmpeg_paths = [
        Path(os.environ.get("APPDATA", "")) / "zipp" / "bin",  # AppData/Roaming/zipp/bin
        Path(__file__).parent.parent.parent / "bin",  # ../../bin relative to this file
    ]

    for p in ffmpeg_paths:
        ffmpeg_path = p / "ffmpeg.exe"
        if ffmpeg_path.exists():
            paths_to_add.append(str(p))
            print(f"[Video DL] Found ffmpeg at {p}")
            break

    # Add all paths to PATH
    if paths_to_add:
        os.environ["PATH"] = os.pathsep.join(paths_to_add) + os.pathsep + os.environ.get("PATH", "")

# Set up paths on module load
setup_paths()


def check_dependencies():
    """Check if yt-dlp and ffmpeg are available."""
    missing = []
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        missing.append("yt-dlp")

    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        missing.append("ffmpeg")

    return missing


class DownloadRequest(BaseModel):
    """Request body for video/audio download."""
    url: str = Field(..., description="Video URL (YouTube, Vimeo, Twitter, TikTok, SoundCloud, etc.)")
    mode: Literal["video", "audio"] = Field(default="video", description="Download mode: 'video' for full video, 'audio' for audio only")
    start: float = Field(default=0.0, ge=0.0, description="Start time in seconds (for clipping)")
    end: Optional[float] = Field(default=None, description="End time in seconds (None = until end)")
    quality: str = Field(default="best", description="Video quality: 'best', '1080', '720', '480', '360'")
    sample_rate: int = Field(default=44100, ge=8000, le=48000, description="Audio sample rate (audio mode only)")
    mono: bool = Field(default=False, description="Convert audio to mono (audio mode only)")
    filename: Optional[str] = Field(default=None, description="Custom output filename (without extension)")


class DownloadResponse(BaseModel):
    """Response from download."""
    success: bool
    file_path: str
    duration_seconds: float
    mode: str
    video_id: str
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    message: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint."""
    missing = check_dependencies()
    return {
        "status": "ok" if not missing else "missing_dependencies",
        "service": "Video Downloader Server",
        "version": "2.0.0",
        "supported_sites": "1000+ (YouTube, Vimeo, Twitter, TikTok, SoundCloud, etc.)",
        "modes": ["video", "audio"],
        "missing_dependencies": missing,
        "output_dir": OUTPUT_DIR,
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    missing = check_dependencies()
    if missing:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "missing": missing}
        )
    return {"status": "healthy"}


@app.post("/download", response_model=DownloadResponse)
async def download(request: DownloadRequest):
    """
    Download video or extract audio from a URL.

    - mode='video': Downloads full video file (mp4)
    - mode='audio': Extracts audio only (wav)

    Optionally clips to specified time range.
    """
    # Check dependencies
    missing = check_dependencies()
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Missing dependencies: {', '.join(missing)}. Please install them."
        )

    # Extract video ID for filename
    video_id = extract_video_id(request.url)

    # Validate time range
    if request.end is not None and request.end <= request.start:
        raise HTTPException(status_code=400, detail="End time must be greater than start time")

    try:
        # Create temp directory for intermediate files
        with tempfile.TemporaryDirectory(prefix="video_dl_") as workdir:
            workdir_path = Path(workdir)

            print(f"[Video DL] Downloading ({request.mode}): {request.url}")
            print(f"[Video DL] Video ID: {video_id}")

            if request.mode == "video":
                # Download video
                return await download_video(request, video_id, workdir_path)
            else:
                # Download audio only
                return await download_audio(request, video_id, workdir_path)

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Video DL] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def download_video(request: DownloadRequest, video_id: str, workdir_path: Path) -> DownloadResponse:
    """Download video file."""
    raw_video = workdir_path / "video.mp4"

    # Build quality format string
    quality_map = {
        "best": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "1080": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]",
        "720": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]",
        "480": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]",
        "360": "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]",
    }
    format_str = quality_map.get(request.quality, quality_map["best"])

    # Download video with yt-dlp
    dl_cmd = [
        "yt-dlp",
        "-f", format_str,
        "-o", str(raw_video),
        "--no-playlist",
        "--merge-output-format", "mp4",
        request.url,
    ]

    result = subprocess.run(dl_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        error_msg = result.stderr or result.stdout or "Unknown error"
        raise Exception(f"yt-dlp failed: {error_msg}")

    # Check if file was downloaded (yt-dlp might use different extension)
    if not raw_video.exists():
        video_files = list(workdir_path.glob("video.*"))
        if video_files:
            raw_video = video_files[0]
        else:
            raise Exception("Video file was not downloaded")

    print(f"[Video DL] Downloaded: {raw_video}")

    # Build output filename
    if request.filename:
        out_name = request.filename
    else:
        start_int = int(request.start)
        end_int = int(request.end) if request.end else "end"
        out_name = f"video_{video_id}_{start_int}-{end_int}"

    output_path = os.path.join(OUTPUT_DIR, f"{out_name}_{uuid.uuid4().hex[:8]}.mp4")

    # If clipping is needed, use ffmpeg
    if request.start > 0 or request.end is not None:
        ffmpeg_cmd = ["ffmpeg", "-y"]

        if request.start > 0:
            ffmpeg_cmd.extend(["-ss", str(request.start)])

        if request.end is not None:
            ffmpeg_cmd.extend(["-to", str(request.end)])

        ffmpeg_cmd.extend(["-i", str(raw_video), "-c", "copy", output_path])

        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            # If copy fails (different codecs), try re-encoding
            ffmpeg_cmd = ["ffmpeg", "-y"]
            if request.start > 0:
                ffmpeg_cmd.extend(["-ss", str(request.start)])
            if request.end is not None:
                ffmpeg_cmd.extend(["-to", str(request.end)])
            ffmpeg_cmd.extend(["-i", str(raw_video), "-c:v", "libx264", "-c:a", "aac", output_path])
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"ffmpeg failed: {result.stderr}")
    else:
        # Just copy the file
        import shutil
        shutil.copy2(str(raw_video), output_path)

    # Get video info
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate:format=duration",
        "-of", "json",
        output_path
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)

    width, height, fps, duration = None, None, None, 0.0
    if probe_result.returncode == 0:
        import json
        try:
            info = json.loads(probe_result.stdout)
            if info.get("streams"):
                stream = info["streams"][0]
                width = stream.get("width")
                height = stream.get("height")
                # Parse frame rate (e.g., "30/1" or "30000/1001")
                fps_str = stream.get("r_frame_rate", "0/1")
                if "/" in fps_str:
                    num, den = fps_str.split("/")
                    fps = float(num) / float(den) if float(den) > 0 else 0
            if info.get("format"):
                duration = float(info["format"].get("duration", 0))
        except:
            pass

    print(f"[Video DL] Saved: {output_path} ({duration:.1f}s, {width}x{height})")

    return DownloadResponse(
        success=True,
        file_path=output_path,
        duration_seconds=duration,
        mode="video",
        video_id=video_id,
        width=width,
        height=height,
        fps=fps,
        message=f"Downloaded {duration:.1f}s video from {video_id}"
    )


async def download_audio(request: DownloadRequest, video_id: str, workdir_path: Path) -> DownloadResponse:
    """Download audio only."""
    raw_audio = workdir_path / "audio.m4a"

    # Download best audio-only stream
    dl_cmd = [
        "yt-dlp",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "-o", str(raw_audio),
        "--no-playlist",
        request.url,
    ]

    result = subprocess.run(dl_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        error_msg = result.stderr or result.stdout or "Unknown error"
        raise Exception(f"yt-dlp failed: {error_msg}")

    # Check if file was downloaded
    if not raw_audio.exists():
        audio_files = list(workdir_path.glob("audio.*"))
        if audio_files:
            raw_audio = audio_files[0]
        else:
            raise Exception("Audio file was not downloaded")

    print(f"[Video DL] Downloaded: {raw_audio}")

    # Build output filename
    if request.filename:
        out_name = request.filename
    else:
        start_int = int(request.start)
        end_int = int(request.end) if request.end else "end"
        out_name = f"audio_{video_id}_{start_int}-{end_int}"

    output_path = os.path.join(OUTPUT_DIR, f"{out_name}_{uuid.uuid4().hex[:8]}.wav")

    # Build ffmpeg command for conversion
    ffmpeg_cmd = ["ffmpeg", "-y"]

    if request.start > 0:
        ffmpeg_cmd.extend(["-ss", str(request.start)])

    if request.end is not None:
        ffmpeg_cmd.extend(["-to", str(request.end)])

    ffmpeg_cmd.extend(["-i", str(raw_audio)])
    ffmpeg_cmd.extend(["-ar", str(request.sample_rate)])

    if request.mono:
        ffmpeg_cmd.extend(["-ac", "1"])

    ffmpeg_cmd.append(output_path)

    result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"ffmpeg failed: {result.stderr}")

    # Get duration
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        output_path
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
    duration = float(probe_result.stdout.strip()) if probe_result.returncode == 0 else 0.0

    print(f"[Video DL] Saved: {output_path} ({duration:.1f}s)")

    return DownloadResponse(
        success=True,
        file_path=output_path,
        duration_seconds=duration,
        mode="audio",
        video_id=video_id,
        message=f"Extracted {duration:.1f}s of audio from {video_id}"
    )


# Legacy endpoint for backwards compatibility with audio_downloader node
@app.post("/grab")
async def grab_audio_legacy(request: DownloadRequest):
    """Legacy endpoint - redirects to download with mode=audio."""
    request.mode = "audio"
    return await download(request)


@app.get("/info")
async def service_info():
    """Get service information and capabilities."""
    missing = check_dependencies()
    return {
        "service": "Video Downloader",
        "version": "2.0.0",
        "dependencies": {
            "yt-dlp": "yt-dlp" not in missing,
            "ffmpeg": "ffmpeg" not in missing,
        },
        "capabilities": [
            "video-download",
            "audio-download",
            "time-range-clipping",
            "quality-selection",
            "sample-rate-conversion",
            "mono-conversion",
        ],
        "supported_modes": ["video", "audio"],
        "supported_qualities": ["best", "1080", "720", "480", "360"],
        "supported_formats": {
            "video": ["mp4"],
            "audio": ["wav"],
        },
    }


if __name__ == "__main__":
    import uvicorn

    print(f"[Video DL] Starting server on {HOST}:{PORT}")
    print(f"[Video DL] Output directory: {OUTPUT_DIR}")

    # Check dependencies on startup
    missing = check_dependencies()
    if missing:
        print(f"[Video DL] WARNING: Missing dependencies: {', '.join(missing)}")
        print("[Video DL] Please install: pip install yt-dlp, and install ffmpeg")
    else:
        print("[Video DL] All dependencies available")

    uvicorn.run(app, host=HOST, port=PORT)

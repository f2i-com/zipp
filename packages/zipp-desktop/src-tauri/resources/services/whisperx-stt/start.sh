#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo "  WhisperX Speech-to-Text Server"
echo "========================================"
echo

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.10 or 3.11"
    exit 1
fi

# Check if ffmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo "WARNING: ffmpeg is not installed"
    echo "WhisperX requires ffmpeg for audio processing."
    echo "Install via: brew install ffmpeg (macOS) or apt install ffmpeg (Ubuntu)"
    echo
fi

# Create venv if it doesn't exist
if [ ! -f "venv/bin/python" ]; then
    echo "[Setup] Creating virtual environment..."
    python3 -m venv venv

    echo "[Setup] Activating virtual environment..."
    source venv/bin/activate

    echo "[Setup] Upgrading pip..."
    pip install --upgrade pip

    echo "[Setup] Installing PyTorch..."
    # Detect if CUDA is available
    if command -v nvidia-smi &> /dev/null; then
        echo "[Setup] NVIDIA GPU detected, installing CUDA version..."
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
    else
        echo "[Setup] No NVIDIA GPU detected, installing CPU version..."
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    fi

    echo "[Setup] Installing WhisperX and dependencies..."
    pip install -r requirements.txt

    echo "[Setup] Installation complete!"
    echo "========================================"
else
    source venv/bin/activate
fi

# Copy .env.example to .env if .env doesn't exist
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "[Setup] Creating .env from .env.example..."
    cp .env.example .env
fi

echo
echo "[Server] Starting WhisperX Speech-to-Text on port 8770..."
echo "[Server] First run will download Whisper model (~3GB for large-v3)"
echo "[Server] Press Ctrl+C to stop"
echo

python server.py

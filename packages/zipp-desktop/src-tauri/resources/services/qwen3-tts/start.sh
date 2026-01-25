#!/bin/bash
# Qwen3 TTS Server Startup Script (Linux/Mac)

set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  Qwen3 TTS Server"
echo "========================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.12+ from https://python.org"
    exit 1
fi

# Check if venv exists and is valid, create if not
if [ ! -f "venv/bin/python" ]; then
    # Remove corrupted venv if folder exists but python is missing
    if [ -d "venv" ]; then
        echo "[Setup] Removing corrupted virtual environment..."
        rm -rf venv
    fi

    echo "[Setup] Creating virtual environment..."
    python3 -m venv venv

    echo "[Setup] Activating virtual environment..."
    source venv/bin/activate

    echo "[Setup] Upgrading pip..."
    pip install --upgrade pip

    # Detect GPU
    echo "[Setup] Detecting GPU..."
    if command -v nvidia-smi &> /dev/null && nvidia-smi &> /dev/null; then
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1)
        echo "[Setup] Detected NVIDIA GPU: $GPU_NAME"

        # Check for RTX 50xx series
        if echo "$GPU_NAME" | grep -q "RTX 50"; then
            echo "[Setup] Using CUDA 12.8 for RTX 50xx Blackwell"
            pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
        else
            echo "[Setup] Using CUDA 12.4 stable"
            pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
        fi
    elif [ "$(uname)" == "Darwin" ]; then
        # macOS - check for Apple Silicon
        if [ "$(uname -m)" == "arm64" ]; then
            echo "[Setup] Detected Apple Silicon, using MPS acceleration"
            pip install torch torchaudio
        else
            echo "[Setup] Detected Intel Mac, using CPU"
            pip install torch torchaudio
        fi
    else
        echo "[Setup] No NVIDIA GPU detected, using CPU-only PyTorch"
        echo "[Setup] WARNING: TTS will be slow without GPU acceleration"
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    fi

    echo ""
    echo "[Setup] Installing Qwen3 TTS and dependencies..."
    pip install qwen-tts fastapi uvicorn python-multipart python-dotenv soundfile numpy

    echo ""
    echo "========================================"
    echo "[Setup] Installation complete!"
    echo ""
    echo "NOTE: On first run, models will be downloaded from HuggingFace."
    echo "      This may take a while (~3-4 GB download)."
    echo "========================================"
else
    source venv/bin/activate

    # Check if qwen_tts is installed
    if ! venv/bin/python -c "from qwen_tts import Qwen3TTSModel" 2>/dev/null; then
        echo "[Setup] Qwen TTS module not found, installing dependencies..."
        venv/bin/pip install qwen-tts fastapi uvicorn python-multipart python-dotenv soundfile numpy
    fi
fi

echo ""
echo "[Server] Starting Qwen3 TTS on port 8772..."
echo "[Server] Press Ctrl+C to stop"
echo ""

venv/bin/python server.py

#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  HuggingFace LLM Server"
echo "========================================"
echo

# Load .env if it exists
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Defaults
HF_LLM_HOST="${HF_LLM_HOST:-127.0.0.1}"
HF_LLM_PORT="${HF_LLM_PORT:-8774}"

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Install with: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi

# Create venv if needed
if [ ! -f "venv/bin/python" ]; then
    echo "[Setup] Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate

    echo "[Setup] Upgrading pip..."
    pip install --upgrade pip

    echo "[Setup] Installing PyTorch..."
    if command -v nvidia-smi &>/dev/null; then
        echo "[Setup] NVIDIA GPU detected, installing CUDA PyTorch..."
        pip install torch torchvision torchaudio
    else
        echo "[Setup] No NVIDIA GPU detected, installing CPU PyTorch..."
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
    fi

    echo "[Setup] Installing dependencies..."
    pip install -r requirements.txt

    echo "[Setup] Installation complete!"
    echo "========================================"
else
    source venv/bin/activate

    # Quick check
    python -c "import transformers" 2>/dev/null || {
        echo "[Setup] Dependencies not found, installing..."
        pip install -r requirements.txt
    }
fi

echo
echo "[Server] Starting HuggingFace LLM server on port ${HF_LLM_PORT}..."
echo "[Server] Press Ctrl+C to stop"
echo

python server.py

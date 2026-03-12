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

    echo
    echo "[Setup] Installing Flash Attention 2 (may take a few minutes)..."
    pip install flash-attn --no-build-isolation 2>/dev/null || {
        echo "[Setup] Pre-built flash-attn not available, trying wheel..."
        pip install flash-attn 2>/dev/null || {
            echo "[Setup] Flash Attention not available for this system, will use SDPA fallback"
        }
    }

    echo
    echo "[Setup] Installing llama-cpp-python for fast GGUF inference..."
    if command -v nvidia-smi &>/dev/null; then
        pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124 2>/dev/null || {
            echo "[Setup] CUDA wheel not available, trying CPU version..."
            pip install llama-cpp-python 2>/dev/null || {
                echo "[Setup] llama-cpp-python not available, will use transformers backend"
            }
        }
    else
        pip install llama-cpp-python 2>/dev/null || true
    fi

    echo
    echo "[Setup] Installing fast-path libraries (optional)..."
    pip install causal-conv1d 2>/dev/null || true
    pip install triton 2>/dev/null || true

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

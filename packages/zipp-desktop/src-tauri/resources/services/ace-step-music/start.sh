#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo "  ACE-Step Music Generation Server"
echo "========================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed or not in PATH"
    echo "Please install Python 3.11+ using your package manager"
    exit 1
fi

# Check if venv exists and is valid
if [ ! -f "venv/bin/python" ]; then
    # Remove corrupted venv if folder exists but python is missing
    if [ -d "venv" ]; then
        echo "[Setup] Removing corrupted virtual environment..."
        rm -rf venv
    fi

    # Auto-detect GPU using nvidia-smi
    echo "[Setup] Detecting GPU..."
    GPU_NAME=""
    if command -v nvidia-smi &> /dev/null; then
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n 1)
    fi

    if [ -z "$GPU_NAME" ]; then
        echo "[Setup] Could not detect GPU, defaulting to CUDA 12.4"
        CUDA_VERSION="cu124"
        PYTORCH_CHANNEL="https://download.pytorch.org/whl/cu124"
        TORCH_PACKAGES="torch torchaudio"
    else
        echo "[Setup] Detected: $GPU_NAME"

        # Check if it's a 50xx series (Blackwell)
        if echo "$GPU_NAME" | grep -q "RTX 50"; then
            CUDA_VERSION="cu128"
            PYTORCH_CHANNEL="https://download.pytorch.org/whl/cu128"
            TORCH_PACKAGES="torch torchvision torchaudio"
            echo "[Setup] Using CUDA 12.8 for RTX 50xx Blackwell"
        else
            CUDA_VERSION="cu124"
            PYTORCH_CHANNEL="https://download.pytorch.org/whl/cu124"
            TORCH_PACKAGES="torch torchaudio"
            echo "[Setup] Using CUDA 12.4 stable"
        fi
    fi

    echo "[Setup] Creating virtual environment..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create virtual environment"
        exit 1
    fi

    echo "[Setup] Activating virtual environment..."
    source venv/bin/activate

    echo "[Setup] Upgrading pip..."
    python -m pip install --upgrade pip

    echo ""
    echo "[Setup] Installing PyTorch with CUDA $CUDA_VERSION..."
    echo "        Channel: $PYTORCH_CHANNEL"
    echo "        This may take several minutes..."
    pip install $TORCH_PACKAGES --index-url $PYTORCH_CHANNEL

    echo ""
    echo "[Setup] Installing ACE-Step from GitHub..."
    pip install git+https://github.com/ace-step/ACE-Step.git

    echo ""
    echo "[Setup] Installing server dependencies..."
    pip install -r requirements.txt

    echo ""
    echo "[Setup] Installation complete!"
    echo "[Setup] Model will be downloaded on first use (~3GB)"
    echo "========================================"
else
    source venv/bin/activate

    # Check if acestep is installed, install if missing
    if ! python -c "import acestep" 2>/dev/null; then
        echo "[Setup] ACE-Step module not found, installing..."
        pip install git+https://github.com/ace-step/ACE-Step.git
    fi
fi

echo ""
echo "[Server] Starting ACE-Step Music on port 8766..."
echo "[Server] Press Ctrl+C to stop"
echo ""

python server.py

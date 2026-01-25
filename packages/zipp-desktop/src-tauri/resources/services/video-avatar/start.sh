#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo "  Video Avatar Server (Ditto)"
echo "========================================"
echo

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed or not in PATH"
    echo "Please install Python 3.11+ from https://python.org"
    exit 1
fi

# Check if venv exists and is valid
if [ ! -f "venv/bin/python" ]; then
    # Remove corrupted venv if folder exists but python is missing
    if [ -d "venv" ]; then
        echo "[Setup] Removing corrupted virtual environment..."
        rm -rf venv
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
    pip install --upgrade pip

    echo
    echo "[Setup] Installing PyTorch with CUDA..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

    echo
    echo "[Setup] Installing dependencies..."
    pip install -r requirements.txt

    echo
    echo "[Setup] Installation complete!"
    echo "========================================"
else
    source venv/bin/activate

    # Check if fastapi is installed, install if missing
    python -c "import fastapi" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "[Setup] FastAPI not found, installing dependencies..."
        pip install -r requirements.txt
    fi
fi

# Check if models are downloaded
if [ ! -f "checkpoints/ditto_pytorch/models/decoder.pth" ]; then
    echo
    echo "[Setup] Ditto models not found, downloading from HuggingFace..."
    echo "        This will download approximately 6.5GB of model files."
    echo
    python download_models.py
    if [ $? -ne 0 ]; then
        echo
        echo "ERROR: Failed to download models. Check the logs above."
        exit 1
    fi
fi

echo
echo "[Server] Starting Video Avatar Server on port 8768..."
echo "[Server] Press Ctrl+C to stop"
echo

python server.py

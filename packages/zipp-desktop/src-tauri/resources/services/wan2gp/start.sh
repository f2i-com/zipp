#!/bin/bash
# Wan2GP Server Startup Script (Linux/Mac)
set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  Wan2GP Server"
echo "========================================"
echo ""

# Load .env if it exists
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# Defaults
WAN2GP_HOST="${WAN2GP_HOST:-127.0.0.1}"
WAN2GP_PORT="${WAN2GP_PORT:-8773}"
WAN2GP_GRADIO_PORT="${WAN2GP_GRADIO_PORT:-7870}"
WAN2GP_PROFILE="${WAN2GP_PROFILE:-4}"
WAN2GP_ATTENTION="${WAN2GP_ATTENTION:-sdpa}"
WAN2GP_PATH="${WAN2GP_PATH:-Wan2GP}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.11+ from https://python.org"
    exit 1
fi

# Check Git
if ! command -v git &> /dev/null; then
    echo "ERROR: Git is not installed"
    exit 1
fi

# Clone or update Wan2GP
if [ ! -f "$WAN2GP_PATH/wgp.py" ]; then
    if [ -d "$WAN2GP_PATH" ]; then
        echo "[Setup] Wan2GP directory exists but appears incomplete, pulling..."
        cd "$WAN2GP_PATH" && git pull && cd ..
    else
        echo "[Setup] Cloning Wan2GP repository..."
        git clone https://github.com/deepbeepmeep/Wan2GP.git "$WAN2GP_PATH"
    fi
else
    echo "[Setup] Wan2GP already installed"
fi

# Create venv if not present
if [ ! -f "venv/bin/python" ]; then
    echo "[Setup] Creating virtual environment..."
    python3 -m venv venv

    source venv/bin/activate

    echo "[Setup] Upgrading pip..."
    pip install --upgrade pip

    echo ""
    echo "[Setup] Installing PyTorch with CUDA..."
    pip install torch torchvision torchaudio

    echo ""
    echo "[Setup] Installing Wan2GP dependencies..."
    pip install -r "$WAN2GP_PATH/requirements.txt"

    echo ""
    echo "[Setup] Installing API server dependencies..."
    pip install -r requirements.txt

    echo ""
    echo "[Setup] Installation complete!"
    echo "========================================"
else
    source venv/bin/activate

    # Quick check
    python -c "import fastapi" 2>/dev/null || {
        echo "[Setup] API dependencies not found, installing..."
        pip install -r requirements.txt
    }
fi

echo ""
echo "[Server] Starting Wan2GP API server on port $WAN2GP_PORT..."
echo "[Server] Wan2GP Gradio will start on internal port $WAN2GP_GRADIO_PORT"
echo "[Server] Press Ctrl+C to stop"
echo ""

python server.py

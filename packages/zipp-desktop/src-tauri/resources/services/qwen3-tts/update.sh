#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    echo "Service not installed. Skipping update."
    exit 0
fi

echo "=== Updating Qwen3 TTS ==="
source venv/bin/activate
python -m pip install --upgrade pip

echo "Upgrading dependencies..."
pip install --upgrade qwen-tts fastapi uvicorn python-multipart python-dotenv soundfile numpy

echo "=== Qwen3 TTS update complete ==="

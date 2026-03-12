#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    echo "Service not installed. Skipping update."
    exit 0
fi

echo "=== Updating WhisperX Speech-to-Text ==="
source venv/bin/activate
python -m pip install --upgrade pip

echo "Upgrading dependencies..."
pip install -r requirements.txt --upgrade

echo "=== WhisperX Speech-to-Text update complete ==="

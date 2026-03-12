#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    echo "Service not installed. Skipping update."
    exit 0
fi

echo "=== Updating HeartMuLa Music ==="
source venv/bin/activate
python -m pip install --upgrade pip

echo "Upgrading dependencies..."
pip install -r requirements.txt --upgrade

echo "Upgrading HeartMuLa library..."
pip install --upgrade --no-deps git+https://github.com/HeartMuLa/heartlib.git

echo "=== HeartMuLa Music update complete ==="

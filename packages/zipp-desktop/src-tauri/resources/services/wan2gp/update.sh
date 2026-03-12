#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    echo "Service not installed. Skipping update."
    exit 0
fi

# Load .env if it exists
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

WAN2GP_PATH="${WAN2GP_PATH:-Wan2GP}"

echo "=== Updating Wan2GP ==="
source venv/bin/activate
python -m pip install --upgrade pip

# Update the Wan2GP git repository if it exists
if [ -d "$WAN2GP_PATH/.git" ]; then
    echo "Pulling latest Wan2GP changes..."
    cd "$WAN2GP_PATH"
    git pull
    cd "$SCRIPT_DIR"

    echo "Reinstalling Wan2GP dependencies..."
    pip install -r "$WAN2GP_PATH/requirements.txt"
fi

echo "Upgrading API server dependencies..."
pip install -r requirements.txt --upgrade

echo "=== Wan2GP update complete ==="

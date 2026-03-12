#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    echo "Service not installed. Skipping update."
    exit 0
fi

echo "=== Updating ACE-Step Music ==="
source venv/bin/activate
python -m pip install --upgrade pip

echo "Upgrading ACE-Step package..."
pip install --upgrade git+https://github.com/ace-step/ACE-Step.git

echo "Upgrading dependencies..."
pip install -r requirements.txt --upgrade

echo "=== ACE-Step Music update complete ==="

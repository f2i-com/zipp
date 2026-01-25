#!/bin/bash

cd "$(dirname "$0")"

echo "========================================"
echo "  Playwright Browser Service"
echo "========================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.11+ from https://python.org"
    exit 1
fi

# Check if venv exists, create if not
if [ ! -f "venv/bin/python" ]; then
    echo "[Setup] Creating virtual environment..."
    python3 -m venv venv

    echo "[Setup] Activating virtual environment..."
    source venv/bin/activate

    echo "[Setup] Upgrading pip..."
    pip install --upgrade pip

    echo ""
    echo "[Setup] Installing dependencies..."
    pip install -r requirements.txt

    echo ""
    echo "[Setup] Installing Playwright browsers (Chromium)..."
    playwright install chromium

    echo ""
    echo "[Setup] Installation complete!"
    echo "========================================"
else
    source venv/bin/activate

    # Check if playwright is installed
    python -c "import playwright" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "[Setup] Playwright not found, installing dependencies..."
        pip install -r requirements.txt
        echo "[Setup] Installing Playwright browsers..."
        playwright install chromium
    fi
fi

echo ""
echo "[Server] Starting Playwright Browser service on port 8766..."
echo "[Server] Press Ctrl+C to stop"
echo ""

python server.py

#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "Starting Video Downloader server..."
echo "Supports video and audio downloads from 1000+ sites"
echo "Make sure ffmpeg is installed"
echo ""
python server.py

#!/bin/bash
# Chatterbox TTS Server Startup Script (Linux/Mac)
# Make sure you have activated your Python environment first

echo "Starting Chatterbox TTS Server..."
echo ""
echo "Make sure you have:"
echo "  1. Python 3.11 installed"
echo "  2. CUDA available (for GPU acceleration)"
echo "  3. Installed dependencies: pip install -r requirements.txt"
echo ""

python server.py

#!/bin/bash
echo "Starting HeartMuLa Music Generation Server..."

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate

    echo "Installing server dependencies..."
    pip install -r requirements.txt

    echo "Installing HeartMuLa (without strict deps to avoid PyTorch downgrade)..."
    pip install --no-deps git+https://github.com/HeartMuLa/heartlib.git

    echo "Installing PyTorch with CUDA..."
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu126 --force-reinstall
else
    source venv/bin/activate
fi

echo "Starting server..."
python server.py

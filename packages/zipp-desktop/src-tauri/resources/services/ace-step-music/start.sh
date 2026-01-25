#!/bin/bash
echo "Starting ACE-Step Music Generation Server..."

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate

    echo "Installing PyTorch with CUDA..."
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu126

    echo "Installing ACE-Step..."
    pip install git+https://github.com/ace-step/ACE-Step.git

    echo "Installing server dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

echo "Starting server..."
python server.py

@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist "venv" (
    echo Service not installed. Skipping update.
    exit /b 0
)

echo === Updating Qwen3 TTS ===
call venv\Scripts\activate.bat
python -m pip install --upgrade pip

echo Upgrading dependencies...
pip install --upgrade qwen-tts fastapi uvicorn python-multipart python-dotenv soundfile numpy

echo === Qwen3 TTS update complete ===

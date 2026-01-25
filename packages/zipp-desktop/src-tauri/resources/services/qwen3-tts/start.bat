@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Qwen3 TTS Server

echo ========================================
echo   Qwen3 TTS Server
echo ========================================
echo:

REM Check if Python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.12+ from https://python.org
    pause
    exit /b 1
)

REM Check if venv exists and is valid
if exist "venv\Scripts\python.exe" goto :venv_exists

REM Remove corrupted venv if folder exists but python is missing
if exist "venv" (
    echo [Setup] Removing corrupted virtual environment...
    rmdir /s /q venv
)

REM Auto-detect GPU using nvidia-smi
echo [Setup] Detecting GPU...
set "CUDA_VERSION=cpu"
set "PYTORCH_CHANNEL=https://download.pytorch.org/whl/cpu"
set "TORCH_PACKAGES=torch torchaudio"

nvidia-smi >nul 2>nul
if %errorlevel% neq 0 (
    echo [Setup] No NVIDIA GPU detected, using CPU-only PyTorch
    echo [Setup] WARNING: TTS will be slow without GPU acceleration
    goto :setup_venv
)

REM NVIDIA GPU detected - get the name (skip header line with skip=1)
for /f "skip=1 tokens=*" %%a in ('nvidia-smi --query-gpu=name --format=csv 2^>nul') do (
    echo [Setup] Detected: %%a
    echo %%a | findstr /i "RTX 50" >nul
    if !errorlevel! equ 0 (
        echo [Setup] Using CUDA 12.8 for RTX 50xx Blackwell
        set "CUDA_VERSION=cu128"
        set "PYTORCH_CHANNEL=https://download.pytorch.org/whl/cu128"
        set "TORCH_PACKAGES=torch torchvision torchaudio"
    ) else (
        echo [Setup] Using CUDA 12.4 stable
        set "CUDA_VERSION=cu124"
        set "PYTORCH_CHANNEL=https://download.pytorch.org/whl/cu124"
        set "TORCH_PACKAGES=torch torchaudio"
    )
    goto :setup_venv
)

:setup_venv
echo [Setup] Creating virtual environment...
python -m venv venv
if %errorlevel% neq 0 (
    echo ERROR: Failed to create virtual environment
    pause
    exit /b 1
)

echo [Setup] Activating virtual environment...
call venv\Scripts\activate.bat

echo [Setup] Upgrading pip...
python -m pip install --upgrade pip

echo:
echo [Setup] Installing PyTorch with %CUDA_VERSION%...
echo         Channel: %PYTORCH_CHANNEL%
pip install %TORCH_PACKAGES% --index-url %PYTORCH_CHANNEL%

echo:
echo [Setup] Installing Qwen3 TTS and dependencies...
pip install qwen-tts fastapi uvicorn python-multipart python-dotenv soundfile numpy

echo:
echo ========================================
echo [Setup] Installation complete!
echo:
echo NOTE: On first run, models will be downloaded from HuggingFace.
echo       This may take a while, around 3-4 GB download.
echo ========================================
goto :start_server

:venv_exists
call venv\Scripts\activate.bat

REM Check if qwen_tts is installed
venv\Scripts\python.exe -c "from qwen_tts import Qwen3TTSModel" 2>nul
if %errorlevel% neq 0 (
    echo [Setup] Qwen TTS module not found, installing dependencies...
    venv\Scripts\pip.exe install qwen-tts fastapi uvicorn python-multipart python-dotenv soundfile numpy
)

:start_server
echo:
echo [Server] Starting Qwen3 TTS on port 8772...
echo [Server] Press Ctrl+C to stop
echo:

venv\Scripts\python.exe server.py

if %errorlevel% neq 0 (
    echo:
    echo Server stopped with error. Check the logs above.
    pause
)

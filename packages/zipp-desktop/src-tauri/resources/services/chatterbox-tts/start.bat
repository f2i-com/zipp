@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Chatterbox TTS Server

echo ========================================
echo   Chatterbox TTS Server
echo ========================================
echo.

REM Check if Python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.11+ from https://python.org
    pause
    exit /b 1
)

REM Check if venv exists and is valid (has python.exe), create if not
if not exist "venv\Scripts\python.exe" (
    REM Remove corrupted venv if folder exists but python is missing
    if exist "venv" (
        echo [Setup] Removing corrupted virtual environment...
        rmdir /s /q venv
    )

    REM Auto-detect GPU using nvidia-smi
    echo [Setup] Detecting GPU...
    set GPU_NAME=
    for /f "skip=1 tokens=*" %%i in ('nvidia-smi --query-gpu=name --format=csv 2^>nul') do (
        if not defined GPU_NAME set GPU_NAME=%%i
    )

    if not defined GPU_NAME (
        echo [Setup] Could not detect GPU, defaulting to CUDA 12.4
        set CUDA_VERSION=cu124
        set PYTORCH_CHANNEL=https://download.pytorch.org/whl/cu124
        set TORCH_PACKAGES=torch torchaudio
    ) else (
        echo [Setup] Detected: !GPU_NAME!

        REM Check if it's a 50xx series (Blackwell)
        echo !GPU_NAME! | findstr /C:"RTX 50" >nul
        if !errorlevel! equ 0 (
            set CUDA_VERSION=cu128
            set PYTORCH_CHANNEL=https://download.pytorch.org/whl/cu128
            set TORCH_PACKAGES=torch torchvision torchaudio
            echo [Setup] Using CUDA 12.8 for RTX 50xx Blackwell
        ) else (
            set CUDA_VERSION=cu124
            set PYTORCH_CHANNEL=https://download.pytorch.org/whl/cu124
            set TORCH_PACKAGES=torch torchaudio
            echo [Setup] Using CUDA 12.4 stable
        )
    )

    echo [Setup] Creating virtual environment...
    python -m venv venv
    if !errorlevel! neq 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )

    echo [Setup] Activating virtual environment...
    call venv\Scripts\activate.bat

    echo [Setup] Upgrading pip...
    python -m pip install --upgrade pip

    echo.
    echo [Setup] Installing PyTorch with CUDA !CUDA_VERSION!...
    echo         Channel: !PYTORCH_CHANNEL!
    echo         This may take a few minutes...
    pip install !TORCH_PACKAGES! --index-url !PYTORCH_CHANNEL!

    echo.
    echo [Setup] Installing Chatterbox TTS and dependencies...
    pip install -r requirements.txt

    echo.
    echo [Setup] Installation complete!
    echo ========================================
) else (
    call venv\Scripts\activate.bat

    REM Check if chatterbox is installed, install if missing (use venv python directly)
    venv\Scripts\python.exe -c "import chatterbox" 2>nul
    if !errorlevel! neq 0 (
        echo [Setup] Chatterbox module not found, installing dependencies...
        venv\Scripts\pip.exe install -r requirements.txt
    )
)

echo.
echo [Server] Starting Chatterbox TTS on port 8765...
echo [Server] Press Ctrl+C to stop
echo.

venv\Scripts\python.exe server.py

if !errorlevel! neq 0 (
    echo.
    echo Server stopped with error. Check the logs above.
    pause
)

@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title WhisperX Speech-to-Text Server

echo ========================================
echo   WhisperX Speech-to-Text Server
echo ========================================
echo.

REM Check if Python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.10 or 3.11 from https://python.org
    echo Note: Python 3.12+ may have compatibility issues with WhisperX
    pause
    exit /b 1
)

REM Check if ffmpeg is available
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: ffmpeg is not installed or not in PATH
    echo WhisperX requires ffmpeg for audio processing.
    echo Please install ffmpeg: https://ffmpeg.org/download.html
    echo Or via winget: winget install ffmpeg
    echo.
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
        echo [Setup] No NVIDIA GPU detected, using CPU mode
        set CUDA_VERSION=cpu
        set PYTORCH_CHANNEL=https://download.pytorch.org/whl/cpu
        set TORCH_PACKAGES=torch torchaudio
    ) else (
        echo [Setup] Detected: !GPU_NAME!

        REM Check if it's a 50xx series (Blackwell)
        echo !GPU_NAME! | findstr /C:"RTX 50" >nul
        if !errorlevel! equ 0 (
            set CUDA_VERSION=cu128
            set PYTORCH_CHANNEL=https://download.pytorch.org/whl/cu128
            REM Pin to torch 2.8.0 for whisperx 3.7.4 compatibility (requires torch~=2.8.0)
            set TORCH_PACKAGES=torch==2.8.0 torchaudio==2.8.0
            echo [Setup] Using CUDA 12.8 for RTX 50xx Blackwell ^(torch 2.8.0^)
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
    echo [Setup] Installing PyTorch with !CUDA_VERSION!...
    echo         Channel: !PYTORCH_CHANNEL!
    echo         This may take a few minutes...
    pip install !TORCH_PACKAGES! --index-url !PYTORCH_CHANNEL!

    echo.
    echo [Setup] Installing PyAV pre-built wheel...
    REM Force binary-only installation for av to avoid building from source
    pip install --only-binary av av
    if !errorlevel! neq 0 (
        echo [Setup] Direct wheel install failed, trying to download wheel manually...
        REM Get Python version for wheel matching
        for /f "tokens=2 delims=." %%v in ('python -c "import sys; print(sys.version)"') do set PY_MINOR=%%v
        set WHEEL_URL=https://files.pythonhosted.org/packages/cp3!PY_MINOR!/av
        REM Try installing with pip download first
        pip download av --only-binary av -d "%TEMP%\av_wheel" 2>nul
        if exist "%TEMP%\av_wheel\av*.whl" (
            for %%f in ("%TEMP%\av_wheel\av*.whl") do pip install "%%f"
        ) else (
            echo [Setup] WARNING: Could not install av from wheel.
            echo         Speaker diarization may not be available.
            echo         To enable, install av manually: pip install av
        )
    )

    echo.
    echo [Setup] Installing WhisperX and dependencies...
    echo         This may take several minutes on first install...
    pip install --only-binary av --prefer-binary -r requirements.txt

    echo.
    echo [Setup] Installation complete!
    echo ========================================
) else (
    call venv\Scripts\activate.bat

    REM Check if whisperx is installed, install if missing
    venv\Scripts\python.exe -c "import whisperx" 2>nul
    if !errorlevel! neq 0 (
        echo [Setup] WhisperX module not found, installing dependencies...
        venv\Scripts\pip.exe install --only-binary av av
        venv\Scripts\pip.exe install --only-binary av --prefer-binary -r requirements.txt
    )
)

REM Copy .env.example to .env if .env doesn't exist
if not exist ".env" (
    if exist ".env.example" (
        echo [Setup] Creating .env from .env.example...
        copy .env.example .env >nul
    )
)

echo.
echo [Server] Starting WhisperX Speech-to-Text on port 8770...
echo [Server] First run will download Whisper model (~3GB for large-v3)
echo [Server] Press Ctrl+C to stop
echo.

venv\Scripts\python.exe server.py

if !errorlevel! neq 0 (
    echo.
    echo Server stopped with error. Check the logs above.
    pause
)

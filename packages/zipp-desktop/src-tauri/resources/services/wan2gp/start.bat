@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Wan2GP Server

echo ========================================
echo   Wan2GP Server
echo ========================================
echo.

REM Load .env if it exists
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        set "line=%%a"
        if not "!line:~0,1!"=="#" (
            if not "!line!"=="" set "%%a=%%b"
        )
    )
)

REM Defaults
if not defined WAN2GP_HOST set WAN2GP_HOST=127.0.0.1
if not defined WAN2GP_PORT set WAN2GP_PORT=8773
if not defined WAN2GP_GRADIO_PORT set WAN2GP_GRADIO_PORT=7870
if not defined WAN2GP_PROFILE set WAN2GP_PROFILE=4
if not defined WAN2GP_ATTENTION set WAN2GP_ATTENTION=sdpa

REM Check if Python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.11+ from https://python.org
    pause
    exit /b 1
)

REM Check if git is available
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed or not in PATH
    echo Please install Git from https://git-scm.com
    pause
    exit /b 1
)

REM Clone or update Wan2GP
if not defined WAN2GP_PATH set WAN2GP_PATH=Wan2GP
if not exist "!WAN2GP_PATH!\wgp.py" (
    if exist "!WAN2GP_PATH!" (
        echo [Setup] Wan2GP directory exists but appears incomplete, pulling...
        pushd "!WAN2GP_PATH!"
        git pull
        popd
    ) else (
        echo [Setup] Cloning Wan2GP repository...
        git clone https://github.com/deepbeepmeep/Wan2GP.git "!WAN2GP_PATH!"
        if !errorlevel! neq 0 (
            echo ERROR: Failed to clone Wan2GP repository
            pause
            exit /b 1
        )
    )
) else (
    echo [Setup] Wan2GP already installed
)

REM Check if venv exists and is valid, create if not
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
        set TORCH_PACKAGES=torch torchvision torchaudio
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
            set TORCH_PACKAGES=torch torchvision torchaudio
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
    echo [Setup] Installing Wan2GP dependencies...
    pip install -r "!WAN2GP_PATH!\requirements.txt"

    echo.
    echo [Setup] Installing API server dependencies...
    pip install -r requirements.txt

    echo.
    echo [Setup] Installation complete!
    echo ========================================
) else (
    call venv\Scripts\activate.bat

    REM Quick check that fastapi is installed
    venv\Scripts\python.exe -c "import fastapi" 2>nul
    if !errorlevel! neq 0 (
        echo [Setup] API dependencies not found, installing...
        venv\Scripts\pip.exe install -r requirements.txt
    )
)

REM Ensure 4K resolutions are enabled in Wan2GP config
if exist "!WAN2GP_PATH!\wgp_config.json" (
    venv\Scripts\python.exe -c "import json,sys;p=sys.argv[1];f=open(p,'r');cfg=json.load(f);f.close();v=cfg.get('enable_4k_resolutions');cfg['enable_4k_resolutions']=1;f=open(p,'w');json.dump(cfg,f,indent=4);f.close();print('[Config] Enabled 4K resolutions') if v!=1 else None" "!WAN2GP_PATH!\wgp_config.json" 2>nul
)

echo.
echo [Server] Starting Wan2GP API server on port !WAN2GP_PORT!...
echo [Server] Wan2GP Gradio will start on internal port !WAN2GP_GRADIO_PORT!
echo [Server] Press Ctrl+C to stop
echo.

venv\Scripts\python.exe server.py

if !errorlevel! neq 0 (
    echo.
    echo Server stopped with error. Check the logs above.
    pause
)

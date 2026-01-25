@echo off
cd /d "%~dp0"
title Video Downloader Server

echo ========================================
echo   Video Downloader Server
echo ========================================
echo.

REM Check if Python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

REM Add ffmpeg to PATH from common locations
REM Check AppData/zipp/bin (installed location)
if exist "%APPDATA%\zipp\bin\ffmpeg.exe" (
    set "PATH=%APPDATA%\zipp\bin;%PATH%"
    echo [Setup] Found ffmpeg in AppData
    goto :ffmpeg_found
)
REM Check sibling bin folder (resources/bin for dev/installed)
if exist "%~dp0..\..\bin\ffmpeg.exe" (
    set "PATH=%~dp0..\..\bin;%PATH%"
    echo [Setup] Found ffmpeg in bin folder
    goto :ffmpeg_found
)
REM Check Tauri platform-specific name
if exist "%~dp0..\..\bin\ffmpeg-x86_64-pc-windows-msvc.exe" (
    set "PATH=%~dp0..\..\bin;%PATH%"
    echo [Setup] Found ffmpeg in bin folder (platform-specific)
    goto :ffmpeg_found
)

REM Check if ffmpeg is available in system PATH
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: ffmpeg is not installed or not in PATH
    echo Please install ffmpeg from https://ffmpeg.org
    echo Or use: winget install ffmpeg
    echo.
    echo The server will start but downloads may fail.
    echo.
    timeout /t 5
)
:ffmpeg_found

REM Check if venv exists and is valid (has python.exe), create if not
if not exist "venv\Scripts\python.exe" (
    REM Remove corrupted venv if folder exists but python is missing
    if exist "venv" (
        echo [Setup] Removing corrupted virtual environment...
        rmdir /s /q venv
    )
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

    echo.
    echo [Setup] Installing dependencies...
    pip install -r requirements.txt

    echo.
    echo [Setup] Installation complete!
    echo ========================================
) else (
    call venv\Scripts\activate.bat

    REM Check if yt-dlp is installed, install if missing (use venv python directly)
    if not exist "venv\Scripts\yt-dlp.exe" (
        echo [Setup] yt-dlp not found, installing dependencies...
        venv\Scripts\pip.exe install -r requirements.txt
    )
)

echo.
echo [Server] Starting Video Downloader on port 8771...
echo [Server] Supports YouTube, Vimeo, TikTok and 1000+ sites
echo [Server] Modes: video (full video) or audio (audio only)
echo [Server] Press Ctrl+C to stop
echo.

venv\Scripts\python.exe server.py

if %errorlevel% neq 0 (
    echo.
    echo Server stopped with error. Check the logs above.
    pause
)

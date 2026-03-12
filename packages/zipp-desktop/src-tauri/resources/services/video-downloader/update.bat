@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist "venv" (
    echo Service not installed. Skipping update.
    exit /b 0
)

echo === Updating Video Downloader ===
call venv\Scripts\activate.bat
python -m pip install --upgrade pip

echo Upgrading dependencies...
pip install -r requirements.txt --upgrade

echo === Video Downloader update complete ===

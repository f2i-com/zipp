@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist "venv" (
    echo Service not installed. Skipping update.
    exit /b 0
)

:: Load .env if it exists
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "%%A=%%B"
    )
)

if not defined WAN2GP_PATH set "WAN2GP_PATH=Wan2GP"

echo === Updating Wan2GP ===
call venv\Scripts\activate.bat
python -m pip install --upgrade pip

:: Update the Wan2GP git repository if it exists
if exist "%WAN2GP_PATH%\.git" (
    echo Pulling latest Wan2GP changes...
    cd "%WAN2GP_PATH%"
    git pull
    cd /d "%~dp0"

    echo Reinstalling Wan2GP dependencies...
    pip install -r "%WAN2GP_PATH%\requirements.txt"
)

echo Upgrading API server dependencies...
pip install -r requirements.txt --upgrade

echo === Wan2GP update complete ===

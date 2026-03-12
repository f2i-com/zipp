@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist "venv" (
    echo Service not installed. Skipping update.
    exit /b 0
)

echo === Updating ACE-Step Music ===
call venv\Scripts\activate.bat
python -m pip install --upgrade pip

echo Upgrading ACE-Step package...
pip install --upgrade git+https://github.com/ace-step/ACE-Step.git

echo Upgrading dependencies...
pip install -r requirements.txt --upgrade

echo === ACE-Step Music update complete ===

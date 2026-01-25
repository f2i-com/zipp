@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Playwright Browser Service

echo ========================================
echo   Playwright Browser Service
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

REM Check if venv exists and is valid
if exist "venv\Scripts\python.exe" goto :venv_exists

REM Remove corrupted venv if folder exists but python is missing
if exist "venv" (
    echo [Setup] Removing corrupted virtual environment...
    rmdir /s /q venv
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
echo [Setup] Installing dependencies...
pip install -r requirements.txt

echo.
echo [Setup] Installing Playwright browsers (Chromium)...
playwright install chromium

echo.
echo [Setup] Installation complete!
echo ========================================
goto :run_server

:venv_exists
call venv\Scripts\activate.bat

REM Check if playwright is installed, install if missing
venv\Scripts\python.exe -c "import playwright" 2>nul
if !errorlevel! neq 0 (
    echo [Setup] Playwright not found, installing dependencies...
    venv\Scripts\pip.exe install -r requirements.txt
    echo [Setup] Installing Playwright browsers...
    venv\Scripts\playwright.exe install chromium
)

:run_server
echo.
echo [Server] Starting Playwright Browser service on port 8769...
echo [Server] Press Ctrl+C to stop
echo.

venv\Scripts\python.exe server.py

if !errorlevel! neq 0 (
    echo.
    echo Server stopped with error. Check the logs above.
    pause
)

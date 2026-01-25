@echo off
REM Start script for Weather API service on Windows

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment and install dependencies
call venv\Scripts\activate
pip install -q -r requirements.txt

REM Start the server
python server.py

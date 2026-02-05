"""
ACE-Step 1.5 Music Generation Server

A local FastAPI server for music generation using ACE-Step v1.5.
Uses the built-in ACE-Step 1.5 API server with CORS enabled for Tauri webview.

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import sys
from pathlib import Path

# Load environment variables from the same directory as this script
from dotenv import load_dotenv
_script_dir = Path(__file__).parent
load_dotenv(_script_dir / ".env")

# Map our env vars to ACE-Step 1.5 env vars
HOST = os.getenv("ACESTEP_HOST", "127.0.0.1")
PORT = os.getenv("ACESTEP_PORT", "8766")
os.environ["ACESTEP_API_HOST"] = HOST
os.environ["ACESTEP_API_PORT"] = PORT

# Print startup info
print("=" * 40)
print("  ACE-Step 1.5 Music Generation Server")
print("=" * 40)
print(f"Host: {HOST}")
print(f"Port: {PORT}")
print("=" * 40)

if __name__ == "__main__":
    import uvicorn
    from fastapi.middleware.cors import CORSMiddleware

    # Import the ACE-Step app
    from acestep.api_server import create_app

    # Create the app and add CORS middleware
    app = create_app()

    # Add CORS middleware to allow requests from Tauri webview
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for local development
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    print("CORS middleware enabled for Tauri webview")
    print("=" * 40)

    # Run the server
    uvicorn.run(
        app,
        host=HOST,
        port=int(PORT),
        log_level="info"
    )

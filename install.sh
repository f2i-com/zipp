#!/bin/bash
# Zipp Desktop Installation Script (Linux/macOS)
# Installs all npm dependencies for the project

set -e  # Exit on error

# Get the directory where the script is located
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo "  Zipp Desktop Installation"
echo "============================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Warning: Node.js version is $NODE_VERSION. Version 18+ is recommended."
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    exit 1
fi

# Check for Rust (required for Tauri)
if ! command -v cargo &> /dev/null; then
    echo "Warning: Rust is not installed."
    echo "Install Rust from https://rustup.rs/ for Tauri native compilation."
fi

echo "[1/4] Installing FormLogic..."
cd "$DIR/formlogic-typescript" && npm install

echo ""
echo "[2/4] Installing zipp-core..."
cd "$DIR/packages/zipp-core" && npm install

echo ""
echo "[3/4] Installing zipp-ui-components..."
cd "$DIR/packages/zipp-ui-components" && npm install

echo ""
echo "[4/4] Installing zipp-desktop..."
cd "$DIR/packages/zipp-desktop" && npm install

echo ""
echo "============================================"
echo "  Installation Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Run './run_dev.sh' to start development server"
echo "  2. Run './build.sh' to build for production"
echo ""

# Platform-specific notes
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Linux Notes:"
    echo "  - Ensure webkit2gtk is installed: sudo apt install libwebkit2gtk-4.1-dev"
    echo "  - Ensure other Tauri deps: sudo apt install libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev"
    echo ""
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS Notes:"
    echo "  - Ensure Xcode Command Line Tools are installed: xcode-select --install"
    echo ""
fi

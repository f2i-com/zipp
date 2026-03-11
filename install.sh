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

FORMLOGIC_DIR="$DIR/../formlogic-rust"
if [ ! -d "$FORMLOGIC_DIR" ]; then
    echo "Error: formlogic-rust not found at $FORMLOGIC_DIR"
    echo "Please clone formlogic-rust as a sibling of the zipp directory."
    exit 1
fi

echo "[1/5] Building FormLogic WASM..."
if ! command -v wasm-bindgen &> /dev/null; then
    echo "  Installing wasm-bindgen-cli..."
    cargo install wasm-bindgen-cli
fi
rustup target add wasm32-unknown-unknown 2>/dev/null
cd "$FORMLOGIC_DIR"
cargo build -p formlogic-wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir dist-wasm ./target/wasm32-unknown-unknown/release/formlogic_wasm.wasm
if [ ! -f dist-wasm/package.json ]; then
    echo '{"name":"formlogic-lang","version":"0.1.0","main":"formlogic_wasm.js","types":"formlogic_wasm.d.ts","type":"module"}' > dist-wasm/package.json
fi

echo ""
echo "[2/5] Installing zipp-core..."
cd "$DIR/packages/zipp-core" && npm install

echo ""
echo "[3/5] Building zipp-core..."
cd "$DIR/packages/zipp-core" && npm run build

echo ""
echo "[4/5] Installing zipp-ui-components..."
cd "$DIR/packages/zipp-ui-components" && npm install

echo ""
echo "[5/5] Installing zipp-desktop..."
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

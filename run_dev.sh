#!/bin/bash
# Zipp Desktop Development Script (Linux/macOS)
# Builds plugins, deploys resources, and starts Tauri dev server

set -e  # Exit on error

# Get the directory where the script is located
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo "  Zipp Desktop Dev (Linux/macOS)"
echo "============================================"
echo ""

# Step 1: Build plugins
echo "[1/3] Building plugins..."
cd "$DIR/packages/zipp-desktop" && npm run build:plugins

# Step 2: Deploy to XDG data directory (Linux) or Library (macOS)
echo ""
echo "[2/3] Deploying to data directory..."

# Determine data directory based on platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    DATA_DIR="$HOME/Library/Application Support/zipp"
else
    # Linux - use XDG_DATA_HOME or default
    DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/zipp"
fi

mkdir -p "$DATA_DIR/plugins" "$DATA_DIR/services" "$DATA_DIR/bin"

# Copy plugins (exclude node_modules and .git)
echo "  Copying plugins to $DATA_DIR/plugins..."
if command -v rsync &> /dev/null; then
    rsync -av --exclude='node_modules' --exclude='.git' --exclude='__pycache__' \
        "$DIR/packages/zipp-desktop/src-tauri/resources/plugins/" "$DATA_DIR/plugins/"
else
    # Fallback if rsync not available
    cp -r "$DIR/packages/zipp-desktop/src-tauri/resources/plugins/"* "$DATA_DIR/plugins/" 2>/dev/null || true
fi

# Copy services (exclude venv and __pycache__)
echo "  Copying services to $DATA_DIR/services..."
if [ -d "$DIR/packages/zipp-desktop/src-tauri/resources/services" ]; then
    for service_dir in "$DIR/packages/zipp-desktop/src-tauri/resources/services"/*/; do
        if [ -d "$service_dir" ]; then
            service_name=$(basename "$service_dir")
            if command -v rsync &> /dev/null; then
                rsync -av --exclude='venv' --exclude='__pycache__' --exclude='.git' \
                    "$service_dir" "$DATA_DIR/services/$service_name/"
            else
                mkdir -p "$DATA_DIR/services/$service_name"
                cp -r "$service_dir"* "$DATA_DIR/services/$service_name/" 2>/dev/null || true
            fi
        fi
    done
fi

echo "  Resources deployed to: $DATA_DIR"

# Step 3: Start Tauri dev server
echo ""
echo "[3/3] Starting Tauri dev server..."
cd "$DIR/packages/zipp-desktop" && npm run tauri dev


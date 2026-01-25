#!/bin/bash
# Zipp Desktop Build Script
# Builds all dependencies, plugins, and packages the app into an installer

set -e  # Exit on error

# Get the directory where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "============================================"
echo "  Zipp Desktop Build"
echo "============================================"
echo ""

# Step 1: Build FormLogic
echo "[1/5] Building FormLogic..."
cd "$DIR/formlogic-typescript" && npm run build

# Step 2: Build zipp-core
echo ""
echo "[2/5] Building zipp-core..."
cd "$DIR/packages/zipp-core" && npm run build

# Step 3: Build zipp-ui-components
echo ""
echo "[3/5] Building zipp-ui-components..."
cd "$DIR/packages/zipp-ui-components" && npm run build

# Step 4: Build plugins (from zipp-core/modules to resources/plugins)
echo ""
echo "[4/5] Building plugins..."
cd "$DIR/packages/zipp-desktop" && npm run build:plugins

# Step 5: Build zipp-desktop and create installer
echo ""
echo "[5/5] Building zipp-desktop and creating installer..."
cd "$DIR/packages/zipp-desktop" && npm run build && npx tauri build

echo ""
echo "============================================"
echo "  Build Complete!"
echo "============================================"
echo ""
echo "Installer location: packages/zipp-desktop/src-tauri/target/release/bundle/"

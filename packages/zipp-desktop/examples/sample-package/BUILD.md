# Building the Sample Package

This directory contains a sample `.zipp` package structure that demonstrates the ZIPP package format.

## Package Structure

```
sample-package/
├── manifest.json          # Package metadata and configuration
├── flows/
│   └── main.flow.json     # The main workflow
├── assets/
│   └── icon.png           # Package icon (add your own)
└── BUILD.md               # This file
```

## Creating the .zipp File

### Option 1: Using the ZIPP Package Creator UI

1. Open ZIPP Desktop
2. Open the Package Manager panel
3. Click "Create Package"
4. Fill in the package details
5. Select the flows to include
6. Click "Create Package"

### Option 2: Using the Command Line

The `.zipp` format is simply a ZIP archive with a specific structure. You can create one manually:

**On Windows (PowerShell):**
```powershell
cd packages/zipp-desktop/examples/sample-package
Compress-Archive -Path manifest.json, flows, assets -DestinationPath hello-world.zipp
```

**On macOS/Linux:**
```bash
cd packages/zipp-desktop/examples/sample-package
zip -r hello-world.zipp manifest.json flows/ assets/
```

## Package Contents

### manifest.json

The manifest file contains:
- **formatVersion**: Always "1.0" for the current format
- **id**: Unique package identifier (reverse domain style)
- **name**: Human-readable name
- **version**: Semantic version (e.g., "1.0.0")
- **entryFlow**: Path to the main flow that opens when the package runs
- **flows**: Array of flow file paths to include
- **permissions**: What system access the package needs
- **isolation**: Sandbox settings for security

### flows/main.flow.json

A simple workflow with:
- Text input node for user's name
- Template node that creates a greeting
- Output node to display the result

## Installing the Package

1. Double-click the `.zipp` file, or
2. Open ZIPP Desktop → Package Manager → Install → Select the `.zipp` file

The trust dialog will show the requested permissions before installation.

## Security Notes

- Packages are sandboxed by default
- Users must approve permissions before installation
- Package contents are hashed for integrity verification
- Future versions will support digital signatures

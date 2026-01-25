# Zipp

**Visual Agentic Workflow Builder** - A desktop application for creating and running AI-powered automation workflows.

Zipp lets you build complex AI workflows by connecting nodes in a visual graph. Chain LLM calls, browser automation, image/video/audio generation, logic blocks, databases, and more - all without writing code.

![Zipp Desktop](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-orange)
![React](https://img.shields.io/badge/React-18-blue)

## Features

### Visual Workflow Builder
- **Drag-and-Drop Editor** - Build workflows by dragging nodes from the palette onto the canvas
- **Real-time Connections** - Connect nodes with visual edges showing data flow direction
- **Collapsible Nodes** - Minimize nodes to reduce visual clutter while preserving connections
- **Auto-Layout** - Automatic graph layout using dagre for clean, organized workflows
- **Mini Map** - Navigate large workflows with an interactive mini map
- **Node Documentation** - Hover over nodes in the palette to see detailed documentation

### AI Integration
- **Multi-Provider Support** - Connect to OpenAI, Anthropic, Google, Ollama, LM Studio, OpenRouter, Groq, and custom endpoints
- **Streaming Responses** - Real-time token streaming with live output display
- **Vision Models** - Support for multi-modal LLMs with image inputs (attach images directly to prompts)
- **System Prompts** - Configure system prompts per node for specialized AI behavior
- **Max Tokens Control** - Configure maximum token output per LLM call

### AI Flow Designer
- **Natural Language Workflows** - Describe what you want in plain English, get a complete workflow
- **FlowPlan DSL** - Intermediate representation for AI-generated workflows
- **Auto-Compilation** - FlowPlans automatically compile to visual workflow graphs
- **Error Correction** - Built-in retry logic with AI-powered error fixing
- **Capability Controls** - Enable/disable features (files, AI, web, database, loops) per generation

### Browser Automation
- **Full Browser Control** - Browser automation powered by Tauri WebView or Playwright
- **Session Management** - Create persistent browser sessions with custom user agents
- **HTTP Requests** - Make requests with full header control (including Origin headers)
- **Data Extraction** - Extract data using CSS selectors, regex, or JSON path
- **Page Interaction** - Click, type, scroll, and take screenshots programmatically

### Image Generation & Processing
- **Multiple Backends** - Support for OpenAI GPT Image, Google Gemini, and ComfyUI (Stable Diffusion, FLUX, etc.)
- **Image Preview** - Real-time image preview during generation
- **Image Processing** - View, resize, and save images within workflows
- **Image-to-Image** - Use input images for img2img workflows
- **Vectorization** - Convert raster images to SVG vectors

### Video Generation & Processing
- **AI Video Generation** - Generate videos using ComfyUI workflows
- **Video Avatar** - Create lip-synced talking head videos with Ditto
- **Picture-in-Picture** - Overlay videos (e.g., talking heads on screen recordings)
- **Video Concatenation** - Join multiple video clips into one
- **Captions/Subtitles** - Add timed text overlays to videos
- **Audio Mixing** - Mix or replace video audio tracks
- **Frame Extraction** - Extract frames from videos as images
- **Video Download** - Download from YouTube, Vimeo, TikTok, and 1000+ sites

### Audio Generation & Processing
- **Text-to-Speech** - Convert text to natural speech with voice cloning support
- **Speech-to-Text** - Transcribe audio/video with word-level timestamps using WhisperX
- **Music Generation** - Generate AI music from text prompts using ACE-Step
- **Audio Concatenation** - Join multiple audio files together

### File Operations
- **File Read** - Load text, JSON, CSV, and binary files with automatic parsing
- **File Write** - Save content to disk with folder + filename pattern support
- **Template Variables** - Use `{{name}}`, `{{nameWithoutExt}}`, `{{ext}}`, `{{index}}` in output filenames
- **Folder Scanning** - Scan folders with glob patterns for batch processing
- **Text Chunking** - Split large files into batches for processing

### Logic & Control Flow
- **Conditionals** - Branch workflows based on conditions (equals, contains, greater than, etc.)
- **Loops** - Iterate over arrays or counts with loop start/end nodes
- **Logic Blocks** - Write custom JavaScript code for complex transformations
- **Macros** - Create reusable workflow components with custom inputs/outputs
- **Subflows** - Execute other flows as subroutines

### Data Management
- **Templates** - String interpolation with `{{variable}}` syntax
- **Memory Nodes** - Store and retrieve values across workflow runs
- **Per-Flow Database** - Each flow has its own isolated SQLite database
- **Project Constants** - Secure storage for API keys with environment variable support

### Project Management
- **Multi-Flow Projects** - Organize multiple workflows within a single project
- **Flow Library** - Quick access sidebar for switching between flows
- **Packages** - Bundle and share workflows as .zipp packages
- **Local-Only Mode** - Restrict flows to only use local endpoints for privacy
- **Auto-Save** - Automatic project persistence to local storage

## Architecture

```
packages/
├── zipp-desktop/           # Tauri desktop application
│   ├── src/                # React frontend
│   │   ├── components/     # UI components (ZippBuilder, panels, edges)
│   │   ├── hooks/          # React hooks (useWorkflow, useProject)
│   │   ├── contexts/       # React contexts (JobQueue, etc.)
│   │   └── services/       # Services (database, etc.)
│   └── src-tauri/          # Rust backend
│       ├── src/            # Tauri commands, API server, service management
│       └── resources/      # Plugin bundles, external services
├── zipp-core/              # Shared workflow engine
│   ├── src/
│   │   ├── compiler.ts     # Workflow → FormLogic compiler
│   │   ├── runtime.ts      # Workflow execution engine
│   │   ├── module-types.ts # Module/node type definitions
│   │   └── types.ts        # Core type definitions
│   └── modules/            # Node modules (plugins)
│       ├── core-ai/        # AI/LLM nodes
│       ├── core-audio/     # Audio nodes
│       ├── core-browser/   # Browser automation nodes
│       ├── core-database/  # Database nodes
│       ├── core-filesystem/# File system nodes
│       ├── core-flow-control/ # Logic & control flow nodes
│       ├── core-image/     # Image nodes
│       ├── core-input/     # Input nodes
│       ├── core-terminal/  # Terminal/command execution nodes
│       ├── core-utility/   # Utility nodes
│       ├── core-video/     # Video nodes
│       └── plugin-vectorize/ # Image vectorization
├── zipp-mcp-server/        # Claude MCP integration server
│   └── src/                # 50+ tools for workflow management via Claude
├── zipp-ui-components/     # Shared React UI component library
└── formlogic-typescript/   # Expression language VM
```

### Module System

Nodes are organized into modules, each containing:
- `module.json` - Module metadata and configuration
- `nodes/*.json` - Node definitions with properties, inputs, outputs
- `runtime.ts` - Runtime execution code
- `compiler.ts` - Compilation logic

### Dynamic Loading

Zipp uses dynamic loading for both plugins and external services:

**Plugin Loading**: Plugins are loaded at runtime when the app starts. The plugin loader discovers modules in the plugins directory, parses manifests, and evaluates compiled bundles. Plugin globals (React, ReactFlow, ZippCore, Monaco, TauriAPI) are injected to enable seamless integration.

**Service Loading**: External Python services (TTS, STT, music generation, etc.) are started on-demand when workflows require them. The service manager:
1. Reads service configuration from `service.json`
2. Spawns the service as a subprocess
3. Verifies port binding (cross-platform: netstat on Windows, lsof on Unix)
4. Streams output to the frontend via Tauri events
5. Handles graceful shutdown and process cleanup

This approach means services only consume resources when actively needed.

### Execution Flow

1. **Visual Graph** - User creates workflow using drag-and-drop nodes and edges
2. **Compilation** - Graph is compiled to FormLogic script with topological sorting
3. **Execution** - FormLogic VM executes with module-provided builtins
4. **Streaming** - Results stream back to UI in real-time with status updates

## Node Categories

| Category | Nodes |
|----------|-------|
| **Input** | Text Input, File Input, Folder Input, Audio Input, Video Input |
| **AI** | AI LLM |
| **Image** | Image Gen, Image View, Image Save, Image Resize |
| **Video** | Video Gen, Video Save, Video Append, Video Captions, Video Avatar, Video PiP, Audio Mixer, Extend Videos, Video Downloader, Video Frames |
| **Audio** | Text to Speech, Speech to Text, Music Gen, Audio Append, Save Audio |
| **Browser** | Browser Session, Browser Control, Browser Extract, Browser Request |
| **Flow Control** | Condition, Loop Start, Loop End, Macro, Macro Input, Macro Output, Subflow, Output |
| **Data** | Template, Memory, Store Data, Read Data, Logic Block |
| **Utility** | ComfyUI Free Memory, Vectorize Image |

## Quick Start

### Prerequisites

- Node.js 18+
- Rust (for Tauri)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/f2i-com/zipp.git
cd zipp

# Install dependencies
npm install

# Build core packages
cd packages/zipp-core
npm run build

# Build plugins
cd ../zipp-desktop
npm run build:plugins

# Run in development mode
npm run tauri dev
```

### Building for Production

```bash
cd packages/zipp-desktop
npm run tauri build
```

This creates platform-specific installers in `src-tauri/target/release/bundle/`.

## Configuration

### AI Endpoints

Configure AI providers in Project Settings:

| Provider | Endpoint | Format |
|----------|----------|--------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | openai |
| Anthropic | `https://api.anthropic.com/v1/messages` | anthropic |
| Google | `https://generativelanguage.googleapis.com/...` | gemini |
| Ollama | `http://localhost:11434/v1/chat/completions` | openai |
| LM Studio | `http://localhost:1234/v1/chat/completions` | openai |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | openai |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | openai |

### Image Generation

| Provider | Endpoint | Format |
|----------|----------|--------|
| OpenAI GPT Image | `https://api.openai.com/v1/images/generations` | openai |
| Google Gemini | `https://generativelanguage.googleapis.com/...` | gemini |
| ComfyUI | `http://localhost:8188` | comfyui |

### Internal Services

These services are built into the Zipp desktop application:

| Service | Default Port | Description |
|---------|--------------|-------------|
| API Server | `3000` | HTTP API for job queue, workflow management, service control |
| Media Server | `31338` | Serves media files (video/audio) with fallback range 31338-31400 |

### External Services

Some nodes require external Python-based services. These services are **dynamically loaded on demand** - they start automatically when a workflow needs them and can be managed from the app.

| Service | Default Port | Used By |
|---------|--------------|---------|
| ComfyUI | `8188` | Image Gen, Video Gen |
| Chatterbox TTS | `8765` | Text to Speech (with voice cloning) |
| ACE-Step | `8766` | Music Gen (AI music with lyrics) |
| HeartMuLa | `8767` | Music Gen (Float8 quantized alternative) |
| Ditto | `8768` | Video Avatar (lip-synced talking heads) |
| Playwright | `8769` | Browser Session (headless Chromium) |
| WhisperX | `8770` | Speech to Text (word-level timestamps) |
| Video Downloader | `8771` | Video Downloader (YouTube, TikTok, 1000+ sites) |
| Qwen3 TTS | `8772` | Text to Speech (with voice design) |

Services are defined in `packages/zipp-desktop/src-tauri/resources/services/` and managed via Tauri subprocess control with automatic port binding verification.

### Project Constants

Store API keys securely in Project Settings → Constants:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

Reference in nodes using the constant name in API Key fields.

## Development

### Building Components

```bash
# Build core library
cd packages/zipp-core
npm run build

# Build plugins
cd packages/zipp-desktop
npm run build:plugins

# Run desktop app in dev mode
npm run tauri dev
```

### Adding New Node Types

1. Create a new module folder in `zipp-core/modules/` or add to existing module
2. Add node definition JSON in `nodes/` subfolder
3. Add compilation logic in `compiler.ts`
4. Add runtime execution in `runtime.ts`
5. Update `module.json` with the new node
6. Rebuild plugins: `npm run build:plugins`

### Node Definition Structure

```json
{
  "id": "my_node",
  "name": "My Node",
  "description": "Short description",
  "doc": "Detailed documentation shown in hover popover",
  "icon": "icon-name",
  "color": "blue",
  "tags": ["tag1", "tag2"],
  "inputs": [...],
  "outputs": [...],
  "properties": [...],
  "compiler": { ... }
}
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Flow Editor**: @xyflow/react (React Flow)
- **Desktop**: Tauri 2 (Rust)
- **Build**: Vite
- **Database**: SQLite (via @tauri-apps/plugin-sql)
- **Expression Language**: FormLogic (custom VM)

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.

# Zipp - Developer Documentation

## Overview

Zipp is a visual workflow builder for AI automation. It allows users to create, edit, and execute workflows using a node-based graph interface. The system compiles visual workflows into executable FormLogic scripts and runs them with full support for AI integration, file system operations, browser automation, and more.

**Key Features:**
- Visual node-based workflow editor
- Modular plugin architecture with 12+ built-in modules
- AI integration (OpenAI, Anthropic, local LLMs via Ollama/LM Studio)
- Browser automation with headless Chrome/Puppeteer
- File system operations with security sandboxing
- Video/audio processing
- Database storage per workflow
- Package system for sharing workflows (.zipp format)
- FlowPlan DSL for AI-assisted workflow generation

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Zipp Desktop (Tauri + React)                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ ZippBuilder │  │  Node UI    │  │  JobQueueContext        │  │
│  │ (React Flow)│  │  Components │  │  (React Context)        │  │
│  └──────┬──────┘  └─────────────┘  └───────────┬─────────────┘  │
│         │                                      │                │
│  ┌──────▼──────────────────────────────────────▼─────────────┐  │
│  │                     zipp-core                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│  │
│  │  │  Compiler   │──▶   Runtime   │──▶   Job Manager       ││  │
│  │  │ (FormLogic) │  │ (FormLogic) │  │   (Queue System)    ││  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘│  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Module System                           │  │  │
│  │  │  AI | Browser | Filesystem | Video | Audio | DB ... │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    Tauri Backend (Rust)                         │
│  ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────┐ ┌────────────────┐  │
│  │  HTTP  │ │ FFmpeg  │ │Browser │ │ FS   │ │ Media Server   │  │
│  │ Client │ │ Video   │ │Control │ │ Ops  │ │ (localhost)    │  │
│  └────────┘ └─────────┘ └────────┘ └──────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
zipp/
├── packages/
│   ├── zipp-core/           # Core engine (compiler, runtime, modules)
│   │   ├── src/
│   │   │   ├── compiler.ts          # Graph → FormLogic transpiler
│   │   │   ├── runtime.ts           # FormLogic execution engine
│   │   │   ├── queue/               # Job queue system
│   │   │   │   ├── JobManager.ts    # Job lifecycle management
│   │   │   │   └── types.ts         # Job/Queue type definitions
│   │   │   ├── compiler/            # Compiler utilities
│   │   │   │   ├── CycleDetector.ts # Graph cycle detection
│   │   │   │   └── utils.ts         # Sanitization, escaping, sorting
│   │   │   ├── runtime/             # Runtime utilities
│   │   │   │   ├── BoundedMap.ts    # LRU cache for agent memory
│   │   │   │   ├── ValueConverter.ts# FormLogic ↔ JS value conversion
│   │   │   │   └── BuiltinModules.ts# Abort, Agent, Utility modules
│   │   │   ├── errors/              # Error hierarchy
│   │   │   │   ├── index.ts         # ZippError, CompilationError, etc.
│   │   │   │   └── user-messages.ts # User-friendly error formatting
│   │   │   ├── flowplan.ts          # FlowPlan DSL types
│   │   │   ├── flowplan-compiler.ts # FlowPlan → WorkflowGraph
│   │   │   ├── ai-designer.ts       # AI workflow generation
│   │   │   ├── module-types.ts      # Module system type definitions
│   │   │   ├── module-loader.ts     # Dynamic module loading
│   │   │   ├── bundled-modules.ts   # Built-in module registry
│   │   │   ├── package-types.ts     # .zipp package format
│   │   │   ├── constants.ts         # Shared constants
│   │   │   ├── metrics.ts           # Performance metrics
│   │   │   └── logger.ts            # Structured logging
│   │   └── modules/                 # Built-in modules
│   │       ├── core-ai/             # AI LLM & Image generation
│   │       ├── core-browser/        # Browser automation
│   │       ├── core-filesystem/     # File operations
│   │       ├── core-video/          # Video processing
│   │       ├── core-audio/          # Audio/TTS
│   │       ├── core-database/       # Database storage
│   │       ├── core-io/             # Input/Output nodes
│   │       ├── core-flow/           # Flow control (loops, conditions)
│   │       ├── core-network/        # HTTP requests
│   │       ├── core-terminal/       # Shell execution
│   │       └── core-text/           # Text processing
│   │
│   └── zipp-desktop/        # Desktop application
│       ├── src/
│       │   ├── components/          # React components
│       │   │   ├── ZippBuilder.tsx  # Main workflow editor
│       │   │   ├── nodes/           # Node UI components
│       │   │   └── panels/          # Side panels (logs, properties)
│       │   ├── contexts/            # React contexts
│       │   │   ├── JobQueueContext.tsx  # Job queue state
│       │   │   └── ProjectContext.tsx   # Project state
│       │   ├── hooks/               # Custom React hooks
│       │   │   ├── useWorkflow.ts       # Workflow state management
│       │   │   ├── useWorkflowExecution.ts  # Execution lifecycle
│       │   │   └── useAgentLoop.ts      # AI agent integration
│       │   ├── services/            # Service layer
│       │   │   ├── database.ts      # SQLite database operations
│       │   │   └── projectStore.ts  # Project persistence
│       │   └── utils/               # Utility functions
│       └── src-tauri/       # Rust backend
│           ├── src/
│           │   ├── main.rs          # Tauri entry point
│           │   ├── lib.rs           # Tauri commands
│           │   ├── http.rs          # SSRF-protected HTTP client
│           │   ├── fs.rs            # Sandboxed filesystem
│           │   ├── video.rs         # FFmpeg integration
│           │   ├── media_server.rs  # Local media server
│           │   ├── secrets.rs       # OS keychain integration
│           │   ├── packages.rs      # Package management
│           │   └── services.rs      # Background service management
│           └── resources/plugins/   # Native module plugins
│               ├── core-browser/native/   # Puppeteer/Chrome control
│               ├── core-filesystem/native/# File system operations
│               ├── core-video/native/     # FFmpeg bindings
│               └── core-audio/native/     # Audio processing
```

---

## Core Components

### 1. Compiler (`packages/zipp-core/src/compiler.ts`)

The **ZippCompiler** converts a visual workflow graph into executable FormLogic code.

**Compilation Process:**
1. **Validate Edges** - Remove references to non-existent nodes
2. **Detect Cycles** - Throw `CycleDetectedError` if circular dependencies found
3. **Topological Sort** - Determine execution order (dependencies first)
4. **Find Loop Boundaries** - Identify `loop_start`/`loop_end` pairs
5. **Generate Code** - Produce FormLogic script via module compilers

```typescript
// Example usage
const compiler = new ZippCompiler({
  moduleRegistry: registry,
  flows: availableFlows,
  projectSettings: settings,
});

const script = compiler.compile(graph, { prompt: 'Hello AI' });
```

**Key Features:**
- Module-based compilation: Each module provides its own `compileNode()` handler
- Loop support: `loop_start`/`loop_end` with foreach, count, and while_true modes
- Stop conditions: Break loops on contains, equals, starts_with, json_field
- Template compilation: Nodes can define code templates with placeholder substitution

### 2. Runtime (`packages/zipp-core/src/runtime.ts`)

The **ZippRuntime** executes compiled FormLogic scripts.

**Features:**
- **12+ Built-in Modules**: AI, Browser, Filesystem, Video, Audio, etc.
- **Streaming Output**: Real-time token streaming via callbacks
- **Agent Memory**: LRU-bounded persistent memory with SQLite backing
- **Network Security**: SSRF protection, local network whitelisting
- **Abort Support**: Cooperative cancellation via AbortSignal

```typescript
const runtime = createRuntime({
  callbacks: {
    onToken: (nodeId, token) => process.stdout.write(token),
    onLog: (entry) => console.log(entry.message),
    onNodeStatus: (nodeId, status) => console.log(`${nodeId}: ${status}`),
  },
  abortSignal: controller.signal,
  moduleRegistry: registry,
});

const result = await runtime.runWorkflow(graph, flows, inputs);
```

**Runtime Modules (FormLogic):**
- `Abort.check()` / `Abort.checkThrow()` - Check/throw on abort signal
- `Agent.get(key)` / `Agent.set(key, value)` - Persistent memory
- `Utility.httpRequest()` - HTTP requests with SSRF protection

### 3. Job Manager (`packages/zipp-core/src/queue/JobManager.ts`)

Manages workflow execution with queueing, concurrency control, and state tracking.

**Job Lifecycle:**
```
pending → running → completed
                 → failed
                 → aborted
                 → awaiting_ai (Claude-as-AI mode)
```

**Features:**
- **Sequential or Parallel Mode**: Configurable concurrency (1 to N jobs)
- **Priority Queue**: Higher priority jobs execute first
- **Robust Abort**: Cooperative cancellation with force-abort timeout
- **Claude-as-AI Pattern**: Yield at AI nodes for external response injection
- **Job History**: LRU-bounded history with configurable size

```typescript
const jobManager = new JobManager({
  databaseHandler: handleDatabaseRequest,
  networkPermissionHandler: handleNetworkPermission,
  moduleRegistry: registry,
  availableFlows: flows,
});

// Submit a job
const jobId = jobManager.submit(flowId, flowName, graph, inputs);

// Subscribe to events
jobManager.onStateChange((allJobs) => updateUI(allJobs));
jobManager.onLog((jobId, entry) => appendLog(entry));
jobManager.onNodeStatus((jobId, nodeId, status) => highlightNode(nodeId, status));

// Abort
jobManager.abort(jobId);
```

---

## Module System

Modules are pluggable units that provide node types, compilation logic, and runtime methods.

### Module Structure

```
modules/core-ai/
├── manifest.json     # Module metadata and node declarations
├── nodes/            # Node definition JSON files
│   ├── ai_llm.json
│   └── ai_image.json
├── compiler.ts       # Compilation logic
├── runtime.ts        # Runtime methods (FormLogic module)
└── ui/               # React components for nodes
    ├── AILLMNode.tsx
    └── AIImageNode.tsx
```

### Module Manifest (`manifest.json`)

```json
{
  "id": "core-ai",
  "name": "AI Module",
  "version": "1.0.0",
  "category": "AI",
  "description": "AI language models and image generation",
  "nodes": ["ai_llm", "ai_image"],
  "permissions": ["network"],
  "runtime": {
    "typescript": "runtime.ts",
    "compiler": "compiler.ts"
  },
  "ui": {
    "nodes": [
      { "nodeType": "ai_llm", "componentName": "AILLMNode" },
      { "nodeType": "ai_image", "componentName": "AIImageNode" }
    ]
  }
}
```

### Node Definition

```json
{
  "id": "ai_llm",
  "name": "AI LLM",
  "description": "Generate text using a language model",
  "icon": "MessageSquare",
  "color": "#8b5cf6",
  "inputs": [
    { "id": "default", "name": "Input", "type": "string" },
    { "id": "image", "name": "Image", "type": "image", "required": false }
  ],
  "outputs": [
    { "id": "default", "name": "Output", "type": "string" }
  ],
  "properties": [
    { "id": "provider", "name": "Provider", "type": "select", "options": [...] },
    { "id": "model", "name": "Model", "type": "select", "options": [...] },
    { "id": "systemPrompt", "name": "System Prompt", "type": "textarea" },
    { "id": "temperature", "name": "Temperature", "type": "number", "min": 0, "max": 2 }
  ],
  "compiler": {
    "template": "await AI.chat({{systemPrompt}}, {{userPrompt}}, {{options}})"
  },
  "flowplan": {
    "stepTypes": ["ai_llm"],
    "fieldMapping": { "prompt": "userPrompt", "systemPrompt": "systemPrompt" }
  }
}
```

### Module Compiler

```typescript
// compiler.ts
export const compiler: ModuleCompiler = {
  name: 'AIModuleCompiler',

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    if (nodeType === 'ai_llm') {
      const { node, inputs, outputVar, sanitizedId, escapeString } = ctx;
      const systemPrompt = escapeString(node.data.systemPrompt || '');
      const inputVar = inputs.get('default') || 'null';

      return `
        // --- Node: ${node.id} (ai_llm) ---
        let ${outputVar} = await AI.chat(
          "${systemPrompt}",
          ${inputVar},
          { model: "${node.data.model}", temperature: ${node.data.temperature} }
        );
        workflow_context["${node.id}"] = ${outputVar};
      `;
    }
    return null; // Let another compiler handle it
  }
};
```

### Module Runtime

```typescript
// runtime.ts
export const runtime: RuntimeModule = {
  name: 'AI',

  async init(ctx: RuntimeContext): Promise<void> {
    // Initialize module (e.g., load API keys)
  },

  methods: {
    async chat(systemPrompt: string, userPrompt: string, options: any): Promise<string> {
      const response = await ctx.secureFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ ... })
      });
      return result.choices[0].message.content;
    }
  },

  streaming: {
    chat: true  // Mark as streaming method
  }
};
```

### Built-in Modules

| Module | Category | Nodes | Description |
|--------|----------|-------|-------------|
| core-ai | AI | ai_llm, ai_image | LLM chat and image generation |
| core-browser | Browser | browser_control | Puppeteer browser automation |
| core-filesystem | File System | file_read, file_write, file_list | File operations |
| core-video | Video | video_frame_extractor | Extract frames from video |
| core-audio | Audio | tts | Text-to-speech |
| core-database | Database | database_store, database_query | SQLite storage |
| core-io | Input/Output | input_text, output | Workflow I/O |
| core-flow | Flow Control | loop_start, loop_end, condition | Control flow |
| core-network | Network | http_request | HTTP requests |
| core-terminal | Terminal | terminal | Shell commands |
| core-text | Text | template, logic_block | Text processing |

---

## FormLogic Language

FormLogic is a sandboxed JavaScript-like language used for workflow execution.

**Key Differences from JavaScript:**
- `typeof` returns `'array'` for arrays, `'hash'` for objects
- `undefined` is mapped to `null`
- Async/await is fully supported
- Module methods are registered via `engine.registerModule()`

**Built-in Modules:**
```javascript
// Abort checking
await Abort.check();      // Returns true if aborted
await Abort.checkThrow(); // Throws if aborted

// Agent memory (persistent)
await Agent.set("key", value);
let val = await Agent.get("key");
await Agent.delete("key");

// Utility functions
let result = await Utility.httpRequest(url, method, headers, body);
```

**Generated Code Structure:**
```javascript
// Auto-generated Zipp Workflow Script
// Nodes: input1 -> ai1 -> output1

let __inputs = { "prompt": "Hello" };
let workflow_context = __inputs;
let undefined = null;

// --- Node: input1 (input_text) ---
let node_input1_out = __inputs["prompt"] || "";
workflow_context["input1"] = node_input1_out;

// --- Node: ai1 (ai_llm) ---
let node_ai1_out = await AI.chat("You are helpful", node_input1_out, {...});
workflow_context["ai1"] = node_ai1_out;

// --- Node: output1 (output) ---
let node_output1_out = node_ai1_out;
workflow_context["output1"] = node_output1_out;
workflow_context["__output__"] = node_output1_out;

workflow_context;
```

---

## FlowPlan DSL

FlowPlan is a simplified JSON format for AI-generated workflows.

### Structure

```json
{
  "name": "Image Processor",
  "description": "Process images in a folder with AI",
  "inputs": [
    { "name": "folder", "type": "folder_path", "description": "Image folder" },
    { "name": "prompt", "type": "text", "default": "Describe this image" }
  ],
  "collections": [
    {
      "name": "images",
      "type": "folder_files",
      "from": "{{folder}}",
      "include": ["*.jpg", "*.png"]
    }
  ],
  "loop": {
    "mode": "for_each",
    "over": "images",
    "itemAlias": "image",
    "steps": [
      { "id": "read", "type": "file_read", "path": "{{image}}", "as": "base64" },
      { "id": "describe", "type": "ai_llm", "prompt": "{{prompt}}", "image": "{{read}}" },
      { "id": "log", "type": "log", "message": "{{describe}}" }
    ]
  }
}
```

### Step Types

| Type | Description |
|------|-------------|
| `file_read` | Read file as text or base64 |
| `file_write` | Write content to file |
| `template` | String interpolation |
| `ai_llm` | AI text generation |
| `ai_image` | AI image generation |
| `condition` | Branching logic |
| `http_request` | HTTP requests |
| `database_store` | Store data in database |
| `log` | Log message |
| `output` | Mark workflow output |
| `logic_block` | Custom code |

### Compilation

```typescript
import { compileFlowPlan, layoutFlowPlanGraph } from 'zipp-core';

const result = compileFlowPlan(flowPlan, { aiModel: 'gpt-4' });
const layoutedGraph = layoutFlowPlanGraph(result.graph);
```

---

## Package System (.zipp)

Packages allow sharing workflows with embedded assets, macros, and custom nodes.

### Package Structure

```
my-package.zipp (ZIP archive)
├── manifest.json        # Package metadata
├── main-flow.json       # Primary workflow
├── macros/              # Embedded macro flows
│   └── helper.json
├── assets/              # Embedded assets
│   └── template.txt
├── nodes/               # Custom node definitions
│   └── my_node.json
└── services/            # Background services (optional)
    └── service.py
```

### Manifest

```json
{
  "id": "my-package",
  "name": "My Package",
  "version": "1.0.0",
  "format": "1.0",
  "description": "Example package",
  "author": "Developer",
  "permissions": ["filesystem", "network"],
  "mainFlow": "main-flow.json",
  "macros": ["macros/helper.json"],
  "customNodes": [
    {
      "id": "my_node",
      "definition": "nodes/my_node.json",
      "runtime": "nodes/my_node.runtime.ts"
    }
  ],
  "services": [
    {
      "id": "backend",
      "command": "python service.py",
      "port": 8080
    }
  ]
}
```

---

## Desktop Application

### Technology Stack

- **Frontend**: React 18 + TypeScript
- **Graph Editor**: @xyflow/react (React Flow)
- **State Management**: React Context + custom hooks
- **Styling**: Tailwind CSS
- **Backend**: Tauri (Rust)
- **Database**: SQLite (per-flow databases)

### Key Components

**ZippBuilder** (`src/components/ZippBuilder.tsx`)
- Main workflow editor using React Flow
- Handles node creation, connection, and updates
- Integrates with JobQueueContext for execution

**JobQueueContext** (`src/contexts/JobQueueContext.tsx`)
- React context wrapping JobManager
- Provides hooks: `useJobQueue`, `useJobLogs`, `useJobNodeStatus`
- Manages job lifecycle and subscriptions

**useWorkflowExecution** (`src/hooks/useWorkflowExecution.ts`)
- Hook for workflow execution lifecycle
- Handles job submission, abort, completion
- Updates node status during execution

### Tauri Backend

**HTTP Client** (`src-tauri/src/http.rs`)
- SSRF-protected HTTP requests
- Local network access control
- Follows redirects safely

**File System** (`src-tauri/src/fs.rs`)
- Sandboxed file operations
- Async file reading/writing
- Directory listing with filters

**Media Server** (`src-tauri/src/media_server.rs`)
- Local HTTP server for serving media files
- Enables video/image preview in UI
- Dynamic port allocation

---

## Database System

Each workflow has its own SQLite database for isolated storage.

### Schema

```sql
-- Collections (document storage)
CREATE TABLE _collections (
  id INTEGER PRIMARY KEY,
  collection TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_collections_collection ON _collections(collection);
CREATE INDEX idx_collections_collection_created ON _collections(collection, created_at DESC);
CREATE INDEX idx_collections_updated ON _collections(updated_at DESC);
```

### Usage in Runtime

```typescript
// Via RuntimeContext.database
await ctx.database.insertDocument('users', { name: 'Alice', age: 30 });
const users = await ctx.database.findDocuments('users', { age: { $gt: 25 } });
await ctx.database.updateDocument(userId, { age: 31 });
await ctx.database.deleteDocument(userId);
```

### Agent Memory

Agent memory uses a special `_agent_memory` collection for cross-workflow persistence:
```typescript
await Agent.set('conversation_history', messages);
const history = await Agent.get('conversation_history');
```

---

## Security Features

### SSRF Protection
- Tauri HTTP client blocks private network access by default
- Whitelist-based local network access control
- User approval required for new local addresses

### Filesystem Sandboxing
- Operations restricted to allowed directories
- User approval for sensitive paths
- Path traversal prevention

### Secret Management
- API keys stored in OS keychain (not in project files)
- Secrets never logged or exposed in UI
- Environment variable support

### Network Security
```typescript
// In RuntimeContext
secureFetch: async (url, options) => {
  if (isLocalNetworkUrl(url) && !isWhitelisted(url)) {
    const response = await onLocalNetworkPermission({ url, hostPort });
    if (!response.allowed) throw new Error('Access denied');
  }
  return tauriHttpRequest(url, options);
}
```

---

## Error Handling

### Error Hierarchy

```typescript
ZippError (base)
├── CompilationError
│   ├── CycleDetectedError    // Circular dependencies
│   ├── UnknownNodeTypeError  // Invalid node type
│   └── InvalidLoopError      // Malformed loop structure
├── RuntimeError
│   ├── AbortError            // User cancelled
│   ├── MissingInputError     // Required input not provided
│   └── ExternalApiError      // API call failed
└── ModuleError
    ├── ModuleValidationError
    ├── ModuleDependencyError
    └── ModuleLoadError
```

### User-Friendly Messages

```typescript
import { formatErrorForUser, getErrorSummary } from 'zipp-core';

try {
  await runtime.execute(script);
} catch (error) {
  const friendly = formatErrorForUser(error);
  showToast(friendly.message, 'error');
  // { title: "Workflow Stopped", message: "The workflow was stopped by the user.", suggestion: null }
}
```

---

## Performance Metrics

The metrics system tracks compilation and execution performance:

```typescript
import { metrics } from 'zipp-core';

// Track timing
const endTimer = metrics.startTimer('compilation');
// ... do work ...
endTimer();

// Increment counters
metrics.increment('compilations');
metrics.increment('jobsCompleted');

// Set gauges
metrics.setGauge('activeJobs', count);
metrics.setGauge('queueDepth', queue.length);

// Get summary
const summary = metrics.getSummary();
// { compilations: 10, avgCompilationTime: 45ms, ... }
```

---

## Constants

Centralized constants in `packages/zipp-core/src/constants.ts`:

```typescript
// Graph processing limits
export const MAX_GRAPH_ITERATIONS = 10000;
export const MAX_WORKFLOW_LOOP_ITERATIONS = 1000;

// Job queue
export const MAX_JOB_HISTORY_SIZE = 100;
export const FORCE_ABORT_TIMEOUT_MS = 30000;

// Memory limits
export const MAX_AGENT_MEMORY_ENTRIES = 1000;
export const MAX_AGENT_MEMORY_VALUE_SIZE = 1024 * 1024; // 1MB
```

---

## Development Setup

### Prerequisites

- Node.js 18+
- Rust (for Tauri)
- pnpm (package manager)

### Installation

```bash
# Clone repository
git clone https://github.com/f2i-com/zipp.git
cd zipp

# Install dependencies
pnpm install

# Build zipp-core
cd packages/zipp-core
pnpm build
cd ../..
```

### Running Development Server

```bash
# Start desktop app in development mode
cd packages/zipp-desktop
pnpm tauri dev
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run stress tests
pnpm test -- --grep "stress"
```

### Building for Production

```bash
# Build desktop app
cd packages/zipp-desktop
pnpm tauri build
```

---

## Testing

### Test Structure

```
packages/zipp-core/src/__tests__/
├── compiler.test.ts      # Compiler unit tests
├── runtime.test.ts       # Runtime unit tests
├── JobManager.test.ts    # Job queue tests
├── BoundedMap.test.ts    # LRU cache tests
├── CycleDetector.test.ts # Graph cycle detection
├── flowplan.test.ts      # FlowPlan DSL tests
└── stress-tests.test.ts  # Performance/stress tests
```

### Stress Test Coverage

- **Concurrent Jobs**: 50+, 100+ simultaneous jobs
- **Large Workflows**: 100+, 200 node graphs
- **Complex Graphs**: Branching, diamond patterns, deep chains
- **Memory Pressure**: 10,000 BoundedMap entries, LRU eviction
- **Performance Benchmarks**: Compile <1s, Submit <100ms

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- No `as any` in production code (except Tauri interop)
- JSDoc for public APIs

---

## License

Apache 2.0 License - See [LICENSE](LICENSE) for details.

---

*Last Updated: January 2026*

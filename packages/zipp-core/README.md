# zipp-core

Shared core engine for Zipp workflow builder. Provides the compiler, runtime, type definitions, and module system for building and executing visual workflows.

## Features

- **Workflow Compiler** - Compiles visual workflow graphs into executable FormLogic scripts
- **Runtime Engine** - Executes compiled workflows with module support, streaming, and abort handling
- **Module System** - Extensible architecture for adding custom nodes and functionality
- **12 Built-in Modules** - AI, Audio, Browser, Database, Filesystem, Flow Control, Image, Input, Terminal, Utility, Video, and Vectorize

## Installation

```bash
npm install zipp-core
```

## Quick Start

```typescript
import { ZippCompiler } from 'zipp-core/compiler';
import { ZippRuntime } from 'zipp-core/runtime';

// Create a workflow graph
const graph = {
  nodes: [
    { id: 'input1', type: 'input_text', data: { value: 'Hello' } },
    { id: 'template1', type: 'template', data: { template: '{{input}} World!' } },
  ],
  edges: [
    { source: 'input1', target: 'template1', sourceHandle: 'default', targetHandle: 'default' },
  ],
};

// Compile the workflow
const compiler = new ZippCompiler();
const script = compiler.compile(graph);

// Execute the workflow
const runtime = new ZippRuntime();
const result = await runtime.execute(script);
```

## Project Structure

```
zipp-core/
├── src/
│   ├── compiler.ts          # Workflow graph to script compiler
│   ├── runtime.ts           # Script execution engine
│   ├── logger.ts            # Structured logging utility
│   ├── types.ts             # Core type definitions
│   ├── module-types.ts      # Module system types
│   ├── flowplan.ts          # FlowPlan data structures
│   ├── flowplan-compiler.ts # FlowPlan compilation
│   └── __tests__/           # Core tests
│       ├── compiler.test.ts
│       ├── runtime.test.ts
│       ├── logger.test.ts
│       ├── flows.test.ts
│       └── integration/
│           └── workflow-patterns.test.ts
├── modules/
│   ├── core-ai/             # LLM chat and API requests
│   ├── core-audio/          # TTS, STT, audio processing
│   ├── core-browser/        # Web scraping and automation
│   ├── core-database/       # Data storage and querying
│   ├── core-filesystem/     # File operations
│   ├── core-flow-control/   # Conditions, loops, macros
│   ├── core-image/          # Image generation and processing
│   ├── core-input/          # User input handling
│   ├── core-terminal/       # Shell command execution
│   ├── core-utility/        # Templates, HTTP, memory
│   ├── core-video/          # Video processing
│   ├── plugin-vectorize/    # Image to SVG conversion
│   └── __tests__/           # Module tests
└── dist/                    # Compiled output
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --testPathPattern="compiler"

# Run tests with coverage report
npm test -- --coverage
```

### Test Structure

The test suite includes:

- **Core Tests** (`src/__tests__/`)
  - `compiler.test.ts` - Workflow compilation, node ordering, loop detection
  - `runtime.test.ts` - Script execution, context management, memory handling
  - `logger.test.ts` - Logging levels, handlers, structured output
  - `flows.test.ts` - End-to-end workflow patterns
  - `template-compiler.test.ts` - Template variable substitution
  - `flowplan-compiler.test.ts` - FlowPlan DSL compilation
  - `flowplan-decompiler.test.ts` - Graph to FlowPlan conversion
  - `node-extension-registry.test.ts` - Custom node extensions
  - `JobManager.test.ts` - Job queue system
  - `edge-cases.test.ts` - Large graphs, nested loops, error recovery, benchmarks

- **Integration Tests** (`src/__tests__/integration/`)
  - `workflow-patterns.test.ts` - Linear flows, conditionals, loops, macros, subflows

- **Module Tests** (`modules/__tests__/`)
  - `core-ai.test.ts` - LLM chat, custom API requests
  - `core-audio.test.ts` - Text-to-speech, speech recognition
  - `core-browser.test.ts` - URL fetching, content extraction
  - `core-database.test.ts` - Store/query operations
  - `core-filesystem.test.ts` - Read/write/list operations
  - `core-flow-control.test.ts` - Conditions, loops, macros
  - `core-image.test.ts` - Generation, resize, save
  - `core-input.test.ts` - Text, file, folder inputs
  - `core-terminal.test.ts` - Session management, commands
  - `core-utility.test.ts` - Templates, logic blocks, HTTP
  - `core-video.test.ts` - Info extraction, frame capture
  - `plugin-vectorize.test.ts` - Image vectorization

### Writing Tests

Tests use Jest with ESM support. Example test structure:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import MyModuleRuntime from '../my-module/runtime.js';

describe('MyModuleRuntime', () => {
  beforeEach(async () => {
    await MyModuleRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await MyModuleRuntime.init?.(context);
      expect(logs.some((l) => l.message.includes('initialized'))).toBe(true);
    });
  });

  describe('myMethod', () => {
    it('should process input correctly', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'my_command': { success: true, data: 'result' },
        }),
      });
      await MyModuleRuntime.init?.(context);

      const result = await MyModuleRuntime.methods.myMethod('input', 'node-1');

      expect(result).toBe('expected');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
    });
  });
});
```

### Test Helpers

The `mockRuntimeContext.ts` helper provides:

- `createMockRuntimeContext(options)` - Creates a mock RuntimeContext with:
  - `logs` array - Captured log messages
  - `nodeStatuses` array - Captured node status updates
  - `streamedTokens` array - Captured streaming tokens
  - `tauriInvoke` - Mock Tauri invoke function
  - `fetchResponse` - Mock fetch responses
  - `constants` - Mock constant values

- `createMockTauriInvoke(responses)` - Creates a mock Tauri invoke function
- `createMockFetchResponse(data)` - Creates a mock fetch Response

## Building

```bash
# Build the package
npm run build

# Watch mode for development
npm run watch
```

## Module Development

See [modules/README.md](./modules/README.md) for detailed documentation on creating custom modules.

### Basic Module Structure

```
my-module/
├── module.json      # Module manifest
├── nodes/           # Node definitions
│   └── my_node.json
└── runtime.ts       # TypeScript runtime
```

### Runtime Interface

```typescript
import type { RuntimeContext, RuntimeModule } from '../../src/module-types';

let ctx: RuntimeContext;

const MyModuleRuntime: RuntimeModule = {
  name: 'MyModule',

  async init(context: RuntimeContext): Promise<void> {
    ctx = context;
    ctx.log('info', '[MyModule] Initialized');
  },

  methods: {
    async myMethod(input: string, nodeId: string): Promise<string> {
      ctx.onNodeStatus?.(nodeId, 'running');
      // Process input...
      ctx.onNodeStatus?.(nodeId, 'completed');
      return result;
    },
  },

  async cleanup(): Promise<void> {
    ctx.log('info', '[MyModule] Cleanup');
  },
};

export default MyModuleRuntime;
```

## API Reference

### ZippCompiler

```typescript
const compiler = new ZippCompiler(options?: CompilerOptions);

// Compile a workflow graph to executable script
const script = compiler.compile(graph: WorkflowGraph): string;

// Set module registry for custom compilation
compiler.setModuleRegistry(registry: ModuleRegistry): void;
```

### ZippRuntime

```typescript
const runtime = new ZippRuntime(options?: RuntimeOptions);

// Execute a compiled script
const result = await runtime.execute(script: string, inputs?: Record<string, unknown>): Promise<unknown>;

// Register a module
runtime.registerModule(module: RuntimeModule): void;

// Set abort signal for cancellation
runtime.setAbortSignal(signal: AbortSignal): void;
```

### RuntimeContext

Passed to modules during initialization:

```typescript
interface RuntimeContext {
  // Logging
  log(level: LogLevel, message: string): void;

  // Node status updates
  onNodeStatus?(nodeId: string, status: NodeStatus): void;

  // Streaming output
  onStreamToken?(nodeId: string, token: string): void;

  // Tauri integration (desktop only)
  tauri?: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  };

  // Secure HTTP fetch
  secureFetch(url: string, options?: FetchOptions): Promise<Response>;

  // Constants (API keys, etc.)
  getConstant(name: string): string | undefined;
}
```

## License

Apache 2.0

# Zipp Module System

Modules are self-contained packages that provide nodes and functionality to Zipp workflows.

## Module Structure

```
modules/
├── <module-id>/
│   ├── module.json          # Module manifest (required)
│   ├── nodes/               # Node definitions (required)
│   │   ├── node_one.json
│   │   └── node_two.json
│   ├── runtime.ts           # TypeScript runtime (optional)
│   ├── native/              # Native code (optional)
│   │   ├── Cargo.toml       # Rust crate for Tauri plugin
│   │   └── src/
│   │       └── lib.rs
│   ├── bin/                 # External binaries (optional)
│   │   ├── windows/
│   │   ├── macos/
│   │   └── linux/
│   └── assets/              # Static assets (optional)
│       └── ...
```

## Module Manifest (module.json)

```json
{
  "id": "my-module",
  "name": "My Module",
  "version": "1.0.0",
  "description": "Description of the module",
  "author": "Your Name",
  "category": "Utility",
  "icon": "icon-name",
  "color": "blue",
  "nodes": ["node_one", "node_two"],

  "runtime": {
    "typescript": "runtime.ts",
    "native": "native/",
    "dependencies": ["npm-package@1.0.0"]
  },

  "binaries": {
    "ffmpeg": {
      "windows": "bin/windows/ffmpeg.exe",
      "macos": "bin/macos/ffmpeg",
      "linux": "bin/linux/ffmpeg",
      "download": "https://example.com/ffmpeg-{platform}.zip"
    }
  },

  "permissions": ["filesystem", "network", "shell"],

  "settings": {
    "apiKey": {
      "type": "secret",
      "label": "API Key",
      "description": "Your API key"
    }
  }
}
```

## Node Definition (nodes/*.json)

```json
{
  "id": "node_one",
  "name": "Node One",
  "description": "What this node does",
  "icon": "icon-name",
  "color": "blue",
  "tags": ["utility"],

  "inputs": [
    {
      "id": "default",
      "name": "Input",
      "type": "any",
      "position": "left"
    }
  ],

  "outputs": [
    {
      "id": "default",
      "name": "Output",
      "type": "any",
      "position": "right"
    }
  ],

  "properties": [
    {
      "id": "option",
      "name": "Option",
      "type": "select",
      "default": "a",
      "options": [
        { "value": "a", "label": "Option A" },
        { "value": "b", "label": "Option B" }
      ]
    }
  ],

  "compiler": {
    "template": "{{await}}MyModule.doSomething({{input}}, {{prop.option.raw}}, \"{{nodeId}}\")",
    "async": true,
    "statusTracking": true
  }
}
```

## TypeScript Runtime (runtime.ts)

```typescript
import type { RuntimeContext, RuntimeModule } from '../../src/module-types';

let ctx: RuntimeContext;

async function doSomething(input: unknown, option: string, nodeId: string): Promise<string> {
  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[MyModule] Processing with option: ${option}`);

  // Use ctx.tauri?.invoke() for native calls
  // Use ctx.fetch() for HTTP requests
  // Use ctx.onStreamToken() for streaming output

  ctx.onNodeStatus?.(nodeId, 'completed');
  return 'result';
}

const MyModuleRuntime: RuntimeModule = {
  name: 'MyModule',

  async init(context: RuntimeContext): Promise<void> {
    ctx = context;
  },

  methods: {
    doSomething,
  },

  async cleanup(): Promise<void> {
    // Cleanup resources
  },
};

export default MyModuleRuntime;
```

## Native Code (native/src/lib.rs)

For modules requiring native functionality:

```rust
use tauri::plugin::{Builder, TauriPlugin};

#[tauri::command]
async fn my_native_function(input: String) -> Result<String, String> {
    Ok(format!("Processed: {}", input))
}

pub fn init<R: tauri::Runtime>() -> TauriPlugin<R> {
    Builder::new("my-module")
        .invoke_handler(tauri::generate_handler![my_native_function])
        .build()
}
```

## Creating a New Module

1. Create folder: `modules/my-module/`
2. Create `module.json` with manifest
3. Create `nodes/` folder with node definitions
4. (Optional) Create `runtime.ts` for TypeScript logic
5. (Optional) Create `native/` for Rust code
6. (Optional) Add binaries to `bin/` for external tools

## Module Loading

Modules are loaded in this order:
1. Core bundled modules (compiled into the app)
2. User modules from `~/.zipp/modules/`
3. Project modules from `<project>/.zipp/modules/`

## Best Practices

1. **Keep modules focused** - One module should do one thing well
2. **Use native code sparingly** - Prefer TypeScript when possible
3. **Handle errors gracefully** - Always use try/catch and return meaningful errors
4. **Support streaming** - Use `onStreamToken` for long-running operations
5. **Clean up resources** - Implement the `cleanup()` method
6. **Document your module** - Add descriptions to nodes and properties

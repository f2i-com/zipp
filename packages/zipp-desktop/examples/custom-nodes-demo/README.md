# Custom Nodes & Extensions Demo Package

This example package demonstrates the package system in Zipp and documents the custom nodes and extensions system.

## Package Structure

```
custom-nodes-demo/
├── manifest.json                    # Package manifest (required)
├── custom-nodes-demo.zipp           # Distributable package
├── custom-nodes-definitions.json    # Custom node definitions (for reference)
├── README.md                        # This file
└── flows/
    └── demo.flow.json               # Example flow
```

## Basic Package (Working)

The `custom-nodes-demo.zipp` file contains a working package with:
- A demo flow using built-in nodes (flow_input, text_template, log, flow_output)
- Standard package manifest

**To load this package:**
1. Open Zipp desktop
2. Go to Package Browser
3. Add the `examples/custom-nodes-demo` folder as a source
4. Load the package

## Custom Nodes System (TypeScript Implementation)

The `custom-nodes-definitions.json` file documents custom nodes that can be used once the system fully supports them. The TypeScript infrastructure has been implemented in `zipp-core`:

### Custom Nodes Included:

#### 1. Text Formatter (`text_formatter`)
- **Inputs:** `text` (string)
- **Outputs:** `formatted` (string), `length` (number)
- **Properties:** `format` (uppercase/lowercase/titlecase/reverse/trim), `prefix`, `suffix`

#### 2. JSON Extractor (`json_extractor`)
- **Inputs:** `json` (string), `path` (string, optional)
- **Outputs:** `value` (any), `parsed` (object), `valid` (boolean)
- **Properties:** `defaultPath`, `fallbackValue`

### Node Extensions Included:

#### 1. LLM Response Caching (`llm_response_cache`)
- Extends `ai_llm` nodes with caching capability
- **Additional Input:** `cache_key`
- **Additional Output:** `from_cache`
- **Properties:** `enable_cache`, `cache_ttl`

#### 2. Text Statistics (`text_stats`)
- Extends `text_template` nodes with automatic statistics
- **Additional Outputs:** `word_count`, `char_count`, `line_count`

## TypeScript API

Custom nodes and extensions are managed through:

```typescript
// Custom Node Registry
import {
  CustomNodeRegistry,
  getCustomNodeRegistry,
  validateCustomNodeDefinition
} from 'zipp-core';

// Node Extension Registry
import {
  NodeExtensionRegistry,
  getNodeExtensionRegistry,
  validateNodeExtension
} from 'zipp-core';

// Register a custom node
const registry = getCustomNodeRegistry();
registry.registerNode(customNodeDefinition);

// Register an extension
const extRegistry = getNodeExtensionRegistry();
extRegistry.registerExtension(extensionDefinition);

// Apply extension hooks during compilation
const result = await extRegistry.applyCompilerHooks(node, context, baseCompile);

// Apply extension hooks during runtime
const result = await extRegistry.applyRuntimeHooks(node, context, inputs, baseExecute);
```

## Creating Your Own Package

1. Create a folder with `manifest.json`:
```json
{
  "formatVersion": "1.0",
  "id": "com.yourname.my-package",
  "name": "My Package",
  "version": "1.0.0",
  "description": "Description here",
  "entryFlow": "flows/main.flow.json",
  "flows": ["flows/main.flow.json"]
}
```

2. Add your flow JSON files to `flows/`

3. Package it:
```python
import zipfile
with zipfile.ZipFile('my-package.zipp', 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write('manifest.json')
    zf.write('flows/main.flow.json')
```

## Technical Details

### Custom Node Source Structure

Each custom node definition has:
- **compiler** - Generates FormLogic code at compile time
- **runtime** - Executes the node logic at runtime

The compiler context provides:
- `node` - The node instance being compiled
- `generateVarName(prefix)` - Creates unique variable names
- `getInputValue(id)` - Gets connected input variable
- `getProperty(id)` - Gets property value
- `isInputConnected(id)` - Checks if input has connection

The runtime context provides:
- `inputs` - Object with all input values
- `properties` - Object with all property values
- `context` - Runtime context with logging, fetch, env, etc.

### Extension Hook Structure

Extensions can provide:
- **compilerHook** - Modifies code generation
  - `preCompile(node, context)` - Transform node before compilation
  - `postCompile(code, node, context)` - Transform generated code
  - `injectBefore/injectAfter(node, context)` - Add code around node

- **runtimeHook** - Modifies execution
  - `preExecute(inputs, context)` - Transform inputs
  - `postExecute(result, inputs, context)` - Transform outputs
  - `execute(inputs, context, baseExecute)` - Full override
  - `onError(error, inputs, context)` - Error handler

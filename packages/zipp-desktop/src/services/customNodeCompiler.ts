/**
 * Custom Node Compiler Service
 *
 * Uses esbuild-wasm to compile TypeScript custom node sources from .zipp packages.
 * Compiles compiler, runtime, and UI code for custom nodes.
 */

import * as esbuild from 'esbuild-wasm';
import type { EmbeddedCustomNode } from 'zipp-core';
import { createLogger } from '../utils/logger';

const logger = createLogger('CustomNodeCompiler');

// ============================================
// esbuild Initialization
// ============================================

let esbuildInitialized = false;
let esbuildInitializing = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize esbuild-wasm (only needs to be done once)
 */
async function initializeEsbuild(): Promise<void> {
  if (esbuildInitialized) return;

  if (esbuildInitializing && initPromise) {
    return initPromise;
  }

  esbuildInitializing = true;

  initPromise = (async () => {
    const localWasmURL = '/esbuild.wasm';
    const cdnWasmURL = 'https://unpkg.com/esbuild-wasm@0.24.2/esbuild.wasm';

    try {
      const localCheck = await fetch(localWasmURL, { method: 'HEAD' }).catch(() => null);
      const wasmURL = localCheck?.ok ? localWasmURL : cdnWasmURL;

      if (wasmURL === localWasmURL) {
        logger.debug('Using local esbuild.wasm');
      } else {
        logger.debug('Using CDN esbuild.wasm');
      }

      await esbuild.initialize({ wasmURL });
      esbuildInitialized = true;
      logger.debug('esbuild-wasm initialized');
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      // Handle both possible error messages for already-initialized state
      if (errorMessage.includes('already been called') ||
          errorMessage.includes('more than once') ||
          errorMessage.includes('Cannot call "initialize"')) {
        logger.debug('esbuild-wasm already initialized (shared with plugin compiler)');
        esbuildInitialized = true;
      } else {
        throw error;
      }
    }
  })();

  return initPromise;
}

// ============================================
// Types
// ============================================

export interface CustomNodeCompileResult {
  success: boolean;
  nodeId: string;
  compiled?: {
    compiler: string;
    runtime: string;
    ui?: string;
  };
  error?: string;
}

export interface CustomNodeBatchCompileResult {
  total: number;
  successful: number;
  failed: number;
  results: CustomNodeCompileResult[];
}

// ============================================
// External Module Mappings
// ============================================

const externalGlobals: Record<string, string> = {
  'react': '__PLUGIN_GLOBALS__.React',
  'react-dom': '__PLUGIN_GLOBALS__.ReactDOM',
  'react/jsx-runtime': '__PLUGIN_GLOBALS__.ReactJSXRuntime',
  '@xyflow/react': '__PLUGIN_GLOBALS__.ReactFlow',
  'zipp-core': '__PLUGIN_GLOBALS__.ZippCore',
  'zipp-ui-components': '__PLUGIN_GLOBALS__.ZippUIComponents',
  '@monaco-editor/react': '__PLUGIN_GLOBALS__.MonacoReact',
  '@tauri-apps/api': '__PLUGIN_GLOBALS__.TauriAPI',
  '@tauri-apps/api/core': '__PLUGIN_GLOBALS__.TauriAPICore',
  '@tauri-apps/api/event': '__PLUGIN_GLOBALS__.TauriAPIEvent',
  '@tauri-apps/api/path': '__PLUGIN_GLOBALS__.TauriAPIPath',
  '@tauri-apps/plugin-sql': '__PLUGIN_GLOBALS__.TauriPluginSQL',
};

// ============================================
// Compilation Functions
// ============================================

/**
 * Create an esbuild plugin for virtual file compilation
 */
function createVirtualPlugin(sources: Map<string, string>, entryCode: string): esbuild.Plugin {
  return {
    name: 'virtual-custom-node',
    setup(build) {
      // Handle the entry point
      build.onResolve({ filter: /^__entry__$/ }, () => ({
        path: '__entry__',
        namespace: 'virtual',
      }));

      // Handle relative imports
      build.onResolve({ filter: /^\./ }, (args) => {
        let importerDir = '';
        if (args.importer && args.importer !== '__entry__') {
          const lastSlash = args.importer.lastIndexOf('/');
          if (lastSlash !== -1) {
            importerDir = args.importer.slice(0, lastSlash + 1);
          }
        }

        let resolvedPath = args.path;
        if (resolvedPath.startsWith('./')) {
          resolvedPath = resolvedPath.slice(2);
        }

        const basePath = importerDir + resolvedPath;
        const extensions = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

        for (const ext of extensions) {
          const fullPath = basePath + ext;
          if (sources.has(fullPath)) {
            return { path: fullPath, namespace: 'virtual' };
          }
        }

        return { external: true };
      });

      // Handle external modules
      build.onResolve({ filter: /^[^.]/ }, (args) => {
        if (args.path in externalGlobals) {
          return { path: args.path, namespace: 'external-global' };
        }
        return { external: true };
      });

      // Load external globals
      build.onLoad({ filter: /.*/, namespace: 'external-global' }, (args) => {
        const globalName = externalGlobals[args.path];
        if (globalName) {
          return {
            contents: `
              var mod = ${globalName};
              if (mod && typeof mod === 'object') {
                var result = Object.assign({}, mod, { __esModule: true });
                if (!mod.default) {
                  result.default = mod;
                }
                module.exports = result;
              } else {
                module.exports = mod;
              }
            `,
            loader: 'js',
          };
        }
        return null;
      });

      // Load virtual files
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        if (args.path === '__entry__') {
          return { contents: entryCode, loader: 'ts' };
        }

        const content = sources.get(args.path);
        if (content !== undefined) {
          const loader = args.path.endsWith('.tsx') ? 'tsx' : 'ts';
          return { contents: content, loader };
        }

        return null;
      });
    },
  };
}

/**
 * Compile a single TypeScript/TSX source to JavaScript
 */
async function compileSource(
  source: string,
  filename: string,
  format: 'iife' | 'cjs' = 'iife',
  globalName?: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    await initializeEsbuild();

    const sources = new Map<string, string>();
    sources.set('source.ts', source);

    const entryCode = `export * from './source';`;

    const result = await esbuild.build({
      entryPoints: ['__entry__'],
      bundle: true,
      write: false,
      format,
      globalName,
      platform: 'browser',
      target: 'es2020',
      minify: false,
      plugins: [createVirtualPlugin(sources, entryCode)],
      jsx: 'automatic',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });

    if (result.errors.length > 0) {
      return {
        success: false,
        error: result.errors.map(e => `${filename}: ${e.text}`).join('\n'),
      };
    }

    const output = result.outputFiles?.[0]?.text || '';
    return { success: true, code: output };
  } catch (error) {
    return {
      success: false,
      error: `${filename}: ${String(error)}`,
    };
  }
}

/**
 * Compile a custom node's compiler code
 */
async function compileCompilerCode(source: string, nodeId: string): Promise<{ success: boolean; code?: string; error?: string }> {
  // The compiler code should export a function named 'compile'
  // The source is expected to already export the compile function
  const wrappedSource = `
// Custom node compiler for ${nodeId}
${source}
`;

  return compileSource(wrappedSource, `${nodeId}/compiler.ts`, 'iife', `__CUSTOM_NODE_COMPILER_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}__`);
}

/**
 * Compile a custom node's runtime code
 */
async function compileRuntimeCode(source: string, nodeId: string): Promise<{ success: boolean; code?: string; error?: string }> {
  // The runtime code should export an execute function
  // The source is expected to already export the execute function
  const wrappedSource = `
// Custom node runtime for ${nodeId}
${source}
`;

  return compileSource(wrappedSource, `${nodeId}/runtime.ts`, 'iife', `__CUSTOM_NODE_RUNTIME_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}__`);
}

/**
 * Compile a custom node's UI component
 */
async function compileUICode(source: string, nodeId: string): Promise<{ success: boolean; code?: string; error?: string }> {
  // The UI code should export a default React component
  const wrappedSource = `
// Custom node UI for ${nodeId}
${source}
`;

  return compileSource(wrappedSource, `${nodeId}/ui.tsx`, 'iife', `__CUSTOM_NODE_UI_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}__`);
}

/**
 * Compile a single custom node definition
 */
export async function compileCustomNode(node: EmbeddedCustomNode): Promise<CustomNodeCompileResult> {
  try {
    await initializeEsbuild();

    const compiled: { compiler: string; runtime: string; ui?: string } = {
      compiler: '',
      runtime: '',
    };

    // Compile compiler code
    if (node.source.compiler) {
      const result = await compileCompilerCode(node.source.compiler, node.id);
      if (!result.success) {
        return { success: false, nodeId: node.id, error: `Compiler: ${result.error}` };
      }
      compiled.compiler = result.code!;
    }

    // Compile runtime code
    if (node.source.runtime) {
      const result = await compileRuntimeCode(node.source.runtime, node.id);
      if (!result.success) {
        return { success: false, nodeId: node.id, error: `Runtime: ${result.error}` };
      }
      compiled.runtime = result.code!;
    }

    // Compile UI code (optional)
    if (node.source.ui) {
      const result = await compileUICode(node.source.ui, node.id);
      if (!result.success) {
        return { success: false, nodeId: node.id, error: `UI: ${result.error}` };
      }
      compiled.ui = result.code;
    }

    logger.debug(`Successfully compiled node: ${node.id}`);
    return { success: true, nodeId: node.id, compiled };
  } catch (error) {
    return { success: false, nodeId: node.id, error: String(error) };
  }
}

/**
 * Compile all custom nodes in a package
 */
export async function compileCustomNodes(nodes: EmbeddedCustomNode[]): Promise<CustomNodeBatchCompileResult> {
  const result: CustomNodeBatchCompileResult = {
    total: nodes.length,
    successful: 0,
    failed: 0,
    results: [],
  };

  for (const node of nodes) {
    const compileResult = await compileCustomNode(node);
    result.results.push(compileResult);

    if (compileResult.success) {
      result.successful++;
    } else {
      result.failed++;
      logger.error(`Failed to compile ${node.id}: ${compileResult.error}`);
    }
  }

  logger.debug(`Compiled ${result.successful}/${result.total} custom nodes`);
  return result;
}

/**
 * Check if esbuild is initialized
 */
export function isCompilerReady(): boolean {
  return esbuildInitialized;
}

/**
 * Pre-initialize the compiler (useful for startup)
 */
export async function initializeCompiler(): Promise<void> {
  await initializeEsbuild();
}

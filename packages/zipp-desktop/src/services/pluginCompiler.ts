/**
 * Plugin Compiler Service
 *
 * Uses esbuild-wasm to compile TypeScript plugin sources at runtime.
 * This allows users to modify plugin source code and rebuild without
 * needing to recompile the entire application.
 */

import * as esbuild from 'esbuild-wasm';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../utils/logger';

const logger = createLogger('PluginCompiler');

// ============================================
// esbuild Initialization
// ============================================

let esbuildInitialized = false;
let esbuildInitializing = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize esbuild-wasm (only needs to be done once)
 * Uses local WASM file first, falls back to CDN if local is unavailable
 */
async function initializeEsbuild(): Promise<void> {
  if (esbuildInitialized) return;

  if (esbuildInitializing && initPromise) {
    return initPromise;
  }

  esbuildInitializing = true;

  initPromise = (async () => {
    // Try local WASM file first (bundled in public folder)
    const localWasmURL = '/esbuild.wasm';
    const cdnWasmURL = 'https://unpkg.com/esbuild-wasm@0.24.2/esbuild.wasm';

    try {
      // Check if local WASM is available
      const localCheck = await fetch(localWasmURL, { method: 'HEAD' }).catch(() => null);
      const wasmURL = localCheck?.ok ? localWasmURL : cdnWasmURL;

      if (wasmURL === localWasmURL) {
        logger.debug('Using local esbuild.wasm');
      } else {
        logger.debug('Local WASM not found, using CDN fallback');
      }

      await esbuild.initialize({ wasmURL });
      esbuildInitialized = true;
      logger.debug('esbuild-wasm initialized');
    } catch (error) {
      // esbuild may already be initialized
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('already been called') ||
          errorMessage.includes('more than once') ||
          errorMessage.includes('Cannot call "initialize"')) {
        logger.debug('esbuild-wasm already initialized');
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

export interface PluginInfo {
  id: string;
  path: string;
  has_manifest: boolean;
  has_bundle: boolean;
  has_nodes: boolean;
}

export interface CompileResult {
  success: boolean;
  pluginId: string;
  error?: string;
  output?: string;
}

export interface CompileAllResult {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  results: CompileResult[];
}

export type ProgressCallback = (
  pluginId: string,
  status: 'start' | 'success' | 'error' | 'skip',
  message?: string
) => void;

// ============================================
// Plugin Compilation
// ============================================

/**
 * Read all source files for a plugin and create a virtual file system
 */
async function readPluginSources(pluginId: string, customPath?: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  try {
    // Get list of source files
    const sourceFiles = await invoke<string[]>('list_plugin_sources', {
      pluginId,
      customPath,
    });

    // Read each file
    for (const filePath of sourceFiles) {
      try {
        const content = await invoke<string>('read_plugin_source', {
          pluginId,
          filePath,
          customPath,
        });
        files.set(filePath, content);
      } catch (error) {
        logger.warn(`Failed to read ${filePath}`, { error });
      }
    }
  } catch (error) {
    logger.warn(`Failed to list sources for plugin`, { pluginId, error });
  }

  return files;
}

/**
 * Compile a single plugin
 */
export async function compilePlugin(pluginId: string, customPath?: string): Promise<CompileResult> {
  try {
    // Initialize esbuild if needed
    await initializeEsbuild();

    // Check if plugin has sources
    const hasSources = await invoke<boolean>('plugin_has_sources', {
      pluginId,
      customPath,
    });

    if (!hasSources) {
      return {
        success: false,
        pluginId,
        error: 'No source files found',
      };
    }

    // Read all source files
    const sources = await readPluginSources(pluginId, customPath);

    if (sources.size === 0) {
      return {
        success: false,
        pluginId,
        error: 'No source files could be read',
      };
    }

    // Debug: log all source files found
    logger.debug(`Source files for ${pluginId}`, { files: Array.from(sources.keys()) });

    // Determine what files we have
    const hasRuntime = sources.has('runtime.ts');
    const hasCompiler = sources.has('compiler.ts');

    // Find all UI component files (*.tsx in ui/ folder, excluding index files)
    const uiComponentFiles = Array.from(sources.keys())
      .filter(k => k.startsWith('ui/') && (k.endsWith('.tsx') || k.endsWith('.ts')))
      .filter(k => !k.includes('index.')); // Exclude index files

    const hasUI = uiComponentFiles.length > 0 || sources.has('ui/index.ts') || sources.has('ui/index.tsx');

    if (!hasRuntime && !hasCompiler && !hasUI) {
      return {
        success: false,
        pluginId,
        error: 'No runtime.ts, compiler.ts, or ui/ found',
      };
    }

    // Generate UI imports - either from index file or by scanning individual components
    let uiImportsCode = '';
    let uiExportsCode = 'const uiComponents = {};';

    if (hasUI) {
      // Check if there's an index file first
      if (sources.has('ui/index.ts') || sources.has('ui/index.tsx')) {
        uiImportsCode = `import * as uiComponents from './ui/index';`;
        uiExportsCode = ''; // uiComponents comes from import
      } else if (uiComponentFiles.length > 0) {
        // Auto-generate imports for each component file
        const imports: string[] = [];
        const exports: string[] = [];

        for (const file of uiComponentFiles) {
          // Extract component name from filename (e.g., 'ui/AILLMNode.tsx' -> 'AILLMNode')
          const fileName = file.replace('ui/', '').replace(/\.(tsx?|jsx?)$/, '');
          const importPath = './' + file.replace(/\.(tsx?|jsx?)$/, '');

          // Import the default export as the component name
          imports.push(`import ${fileName} from '${importPath}';`);
          exports.push(`  ${fileName},`);
        }

        uiImportsCode = imports.join('\n');
        uiExportsCode = `const uiComponents = {\n${exports.join('\n')}\n};`;

        logger.debug(`Auto-discovered ${uiComponentFiles.length} UI components for ${pluginId}`, { files: uiComponentFiles });
      }
    }

    // Create the entry point code
    const entryCode = `
// Auto-generated plugin entry point
${hasRuntime ? `import runtime from './runtime';` : 'const runtime = undefined;'}
${hasCompiler ? `import compiler from './compiler';` : 'const compiler = undefined;'}
${uiImportsCode}
${uiExportsCode}

// Export for dynamic loading
export { runtime, compiler };
export const components = uiComponents;
`;

    // Map external modules to global variable names
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

    // Create a plugin to resolve virtual files and externals
    const virtualPlugin: esbuild.Plugin = {
      name: 'virtual-plugin',
      setup(build) {
        // Handle the entry point
        build.onResolve({ filter: /^__entry__$/ }, () => ({
          path: '__entry__',
          namespace: 'virtual',
        }));

        // Handle relative imports
        build.onResolve({ filter: /^\./ }, (args) => {
          // Get the directory of the importing file
          let importerDir = '';
          if (args.importer && args.importer !== '__entry__') {
            const lastSlash = args.importer.lastIndexOf('/');
            if (lastSlash !== -1) {
              importerDir = args.importer.slice(0, lastSlash + 1);
            }
          }

          // Normalize the path
          let resolvedPath = args.path;

          // Remove leading ./
          if (resolvedPath.startsWith('./')) {
            resolvedPath = resolvedPath.slice(2);
          }

          // Handle parent directory references (../)
          if (resolvedPath.startsWith('../')) {
            // Go up one directory from importer
            const parts = importerDir.split('/').filter(Boolean);
            parts.pop(); // Remove the last directory
            importerDir = parts.length > 0 ? parts.join('/') + '/' : '';
            resolvedPath = resolvedPath.slice(3);
          }

          // Combine with importer directory
          const basePath = importerDir + resolvedPath;

          // Try with different extensions
          const extensions = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
          for (const ext of extensions) {
            const fullPath = basePath + ext;
            if (sources.has(fullPath)) {
              return {
                path: fullPath,
                namespace: 'virtual',
              };
            }
          }

          // Not found in sources, let esbuild handle it as external
          return { external: true };
        });

        // Handle external modules - map to globals
        build.onResolve({ filter: /^[^.]/ }, (args) => {
          // Check if this is a known external
          if (args.path in externalGlobals) {
            return {
              path: args.path,
              namespace: 'external-global',
            };
          }
          // Unknown external - still treat as external
          return { external: true };
        });

        // Load external globals
        build.onLoad({ filter: /.*/, namespace: 'external-global' }, (args) => {
          const globalName = externalGlobals[args.path];
          if (globalName) {
            // For modules that use default exports (like @monaco-editor/react),
            // we need to set up proper CommonJS interop so that:
            // - `require(module)` returns the namespace object
            // - `require(module).default` returns the default export
            // The namespace object should have a .default property pointing to the default export
            // __esModule: true tells __toESM not to overwrite the .default property
            return {
              contents: `
                var mod = ${globalName};
                // Ensure .default exists and __esModule is set for proper interop
                if (mod && typeof mod === 'object') {
                  var result = Object.assign({}, mod, { __esModule: true });
                  if (!mod.default) {
                    if (mod.Editor) {
                      // Monaco-editor/react: default export is Editor
                      result.default = mod.Editor;
                    } else {
                      // Generic fallback: use module itself as default
                      result.default = mod;
                    }
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
            return {
              contents: entryCode,
              loader: 'ts',
            };
          }

          const content = sources.get(args.path);
          if (content !== undefined) {
            const loader = args.path.endsWith('.tsx') ? 'tsx' : 'ts';
            return {
              contents: content,
              loader,
            };
          }

          return null;
        });
      },
    };

    // Build the plugin
    const result = await esbuild.build({
      entryPoints: ['__entry__'],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: '__PLUGIN_EXPORTS__',
      platform: 'browser',
      target: 'es2020',
      minify: false,
      plugins: [virtualPlugin],
      jsx: 'automatic',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });

    if (result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.text).join('\n');
      return {
        success: false,
        pluginId,
        error: errorMessages,
      };
    }

    // Get the output
    const output = result.outputFiles?.[0]?.text || '';

    if (!output) {
      return {
        success: false,
        pluginId,
        error: 'No output generated',
      };
    }

    // Write the bundle
    await invoke('write_plugin_bundle', {
      pluginId,
      bundleContent: output,
      customPath,
    });

    return {
      success: true,
      pluginId,
      output,
    };
  } catch (error) {
    return {
      success: false,
      pluginId,
      error: String(error),
    };
  }
}

/**
 * Compile all plugins that have source files
 */
export async function compileAllPlugins(
  customPath?: string,
  onProgress?: ProgressCallback
): Promise<CompileAllResult> {
  const result: CompileAllResult = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  try {
    // Initialize esbuild first
    await initializeEsbuild();

    // Get list of all plugins
    const plugins = await invoke<PluginInfo[]>('list_plugins', {
      customPath,
    });

    result.total = plugins.length;

    for (const plugin of plugins) {
      // Check if plugin has sources
      const hasSources = await invoke<boolean>('plugin_has_sources', {
        pluginId: plugin.id,
        customPath,
      });

      if (!hasSources) {
        onProgress?.(plugin.id, 'skip', 'No source files');
        result.skipped++;
        continue;
      }

      onProgress?.(plugin.id, 'start');

      const compileResult = await compilePlugin(plugin.id, customPath);
      result.results.push(compileResult);

      if (compileResult.success) {
        onProgress?.(plugin.id, 'success');
        result.successful++;
      } else {
        onProgress?.(plugin.id, 'error', compileResult.error);
        result.failed++;
      }
    }
  } catch (error) {
    logger.error('Failed to compile plugins', { error });
  }

  return result;
}

/**
 * Check if a plugin needs rebuilding (source newer than bundle)
 * Returns true if any source file is newer than the bundle, or if bundle doesn't exist
 */
export async function pluginNeedsRebuild(pluginId: string, customPath?: string): Promise<boolean> {
  try {
    const needsRebuild = await invoke<boolean>('plugin_needs_rebuild', {
      pluginId,
      customPath,
    });
    return needsRebuild;
  } catch {
    // Fall back to checking if sources exist
    try {
      const hasSources = await invoke<boolean>('plugin_has_sources', {
        pluginId,
        customPath,
      });
      return hasSources;
    } catch {
      return false;
    }
  }
}

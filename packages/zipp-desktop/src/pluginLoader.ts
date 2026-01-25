/**
 * Runtime Plugin Loader
 *
 * This module handles loading plugins from the filesystem at runtime.
 * Plugins are pre-built bundles that can be dropped into the plugins directory.
 */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactFlow from '@xyflow/react';
import * as TauriAPI from '@tauri-apps/api';
import * as TauriAPICore from '@tauri-apps/api/core';
import * as TauriAPIEvent from '@tauri-apps/api/event';
import * as TauriAPIPath from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import * as ZippCore from 'zipp-core';
import {
  registerBundledModules,
  getBundledModulesArray,
  getModuleLoader,
  loadBundledModules,
  type BundledModule,
  type ModuleManifest,
  type NodeDefinition,
  type RuntimeModule,
  type ModuleCompiler,
} from 'zipp-core';
import * as ZippUIComponents from 'zipp-ui-components';
import { registerNodeComponent, registerComponentByName } from 'zipp-ui-components';
import * as MonacoReact from '@monaco-editor/react';
import { createLogger } from './utils/logger';

const logger = createLogger('PluginLoader');

// Optional dependencies - may not be available
const TauriPluginSQL: unknown = undefined;

// ============================================
// Plugin Globals Setup
// ============================================

/**
 * Set up global variables that plugins can access
 * This allows plugins to use shared dependencies without bundling them
 */
function setupPluginGlobals(): void {
  // Monaco needs special handling for default export
  // Plugins use `import Editor from '@monaco-editor/react'` which becomes `.default`
  // The bundle's __toESM function checks for __esModule to decide whether to set up default exports
  // If __esModule is missing, __toESM overwrites .default with the whole module object
  // So we must set __esModule: true to preserve our .default setting
  const MonacoReactWithDefault = {
    ...MonacoReact,
    __esModule: true,
    default: MonacoReact.default || MonacoReact.Editor || MonacoReact,
  };

  // Define the globals object that plugins will access
  (window as unknown as Record<string, unknown>).__PLUGIN_GLOBALS__ = {
    React,
    ReactDOM,
    ReactJSXRuntime,
    ReactFlow,
    ZippCore,
    ZippUIComponents,
    MonacoReact: MonacoReactWithDefault,
    TauriAPI,
    TauriAPICore,
    TauriAPIEvent,
    TauriAPIPath,
    TauriPluginSQL,
  };

  logger.debug('Plugin globals set up');
}

// Set up globals on module load
setupPluginGlobals();

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

export interface LoadedPlugin {
  manifest: ModuleManifest;
  nodes: NodeDefinition[];
  runtime?: RuntimeModule;
  compiler?: ModuleCompiler;
  components?: Record<string, React.ComponentType<unknown>>;
}

export interface PluginBundle {
  runtime?: RuntimeModule;
  compiler?: ModuleCompiler;
  components?: Record<string, React.ComponentType<unknown>>;
}

export interface PluginLoadResult {
  loaded: string[];
  failed: Array<{ id: string; error: string }>;
}

// ============================================
// Plugin Path Configuration
// ============================================

let configuredPluginsPath: string | undefined;

/**
 * Set the configured plugins path (from settings)
 */
export function setPluginsPath(path: string | undefined): void {
  configuredPluginsPath = path;
}

/**
 * Get the current configured plugins path
 */
export function getConfiguredPluginsPath(): string | undefined {
  return configuredPluginsPath;
}

// ============================================
// Plugin Discovery (via Tauri)
// ============================================

/**
 * Get the default plugins directory path
 */
export async function getDefaultPluginsDirectory(): Promise<string> {
  return invoke<string>('get_default_plugins_dir');
}

/**
 * Get the plugins directory path (uses configured path if set)
 */
export async function getPluginsDirectory(customPath?: string): Promise<string> {
  return invoke<string>('get_plugins_dir', { customPath: customPath ?? configuredPluginsPath });
}

/**
 * List all available plugins
 */
export async function listPlugins(customPath?: string): Promise<PluginInfo[]> {
  return invoke<PluginInfo[]>('list_plugins', { customPath: customPath ?? configuredPluginsPath });
}

/**
 * Read a plugin's manifest
 */
export async function readPluginManifest(pluginId: string, customPath?: string): Promise<ModuleManifest> {
  const content = await invoke<string>('read_plugin_manifest', {
    pluginId,
    customPath: customPath ?? configuredPluginsPath
  });
  return JSON.parse(content) as ModuleManifest;
}

/**
 * Read a plugin's node definitions
 */
export async function readPluginNodes(pluginId: string, customPath?: string): Promise<NodeDefinition[]> {
  const contents = await invoke<string[]>('read_plugin_nodes', {
    pluginId,
    customPath: customPath ?? configuredPluginsPath
  });
  return contents.map(content => JSON.parse(content) as NodeDefinition);
}

/**
 * Read a plugin's bundle code
 */
export async function readPluginBundle(pluginId: string, customPath?: string): Promise<string> {
  return invoke<string>('read_plugin_bundle', {
    pluginId,
    customPath: customPath ?? configuredPluginsPath
  });
}

// ============================================
// Plugin Bundle Evaluation
// ============================================

/**
 * Evaluate a plugin bundle and extract its exports
 * The bundle is an IIFE that assigns to __PLUGIN_EXPORTS__
 * Format: var __PLUGIN_EXPORTS__ = (() => { ... return { runtime, compiler, components }; })();
 */
async function evaluatePluginBundle(bundleCode: string, pluginId: string): Promise<PluginBundle> {
  try {
    // The bundle is an IIFE that creates __PLUGIN_EXPORTS__
    // We need to execute it and capture the result
    // Using Function constructor instead of eval for slightly better security
    const wrappedCode = `
      // Plugin: ${pluginId}
      // Access globals through the __PLUGIN_GLOBALS__ object
      ${bundleCode}
      return typeof __PLUGIN_EXPORTS__ !== 'undefined' ? __PLUGIN_EXPORTS__ : {};
    `;

    // Create a function that executes the bundle
    const executeFn = new Function(wrappedCode);
    const pluginExports = executeFn();

    // Debug: log what we got from the bundle
    logger.debug(`Bundle exports for ${pluginId}`, {
      hasRuntime: !!pluginExports.runtime,
      hasCompiler: !!pluginExports.compiler,
      hasComponents: !!pluginExports.components,
      componentNames: pluginExports.components ? Object.keys(pluginExports.components) : [],
      compilerDetails: pluginExports.compiler ? {
        name: pluginExports.compiler.name,
        hasCompileNode: typeof pluginExports.compiler.compileNode === 'function',
        hasGetNodeTypes: typeof pluginExports.compiler.getNodeTypes === 'function',
      } : null,
    });

    return {
      runtime: pluginExports.runtime,
      compiler: pluginExports.compiler,
      components: pluginExports.components,
    };
  } catch (error) {
    logger.error(`Failed to evaluate bundle for ${pluginId}`, { error });
    throw error;
  }
}

// ============================================
// Plugin Loading
// ============================================

/**
 * Load a single plugin
 */
export async function loadPlugin(pluginInfo: PluginInfo): Promise<LoadedPlugin> {
  logger.debug(`Loading plugin: ${pluginInfo.id}`);

  // Load manifest
  if (!pluginInfo.has_manifest) {
    throw new Error(`Plugin ${pluginInfo.id} is missing manifest.json`);
  }
  const manifest = await readPluginManifest(pluginInfo.id);

  // Load nodes
  const nodes = pluginInfo.has_nodes
    ? await readPluginNodes(pluginInfo.id)
    : [];

  // Load bundle (optional - plugins can be JSON-only for simple nodes)
  let bundle: PluginBundle = {};
  if (pluginInfo.has_bundle) {
    const bundleCode = await readPluginBundle(pluginInfo.id);
    bundle = await evaluatePluginBundle(bundleCode, pluginInfo.id);
  }

  return {
    manifest,
    nodes,
    runtime: bundle.runtime,
    compiler: bundle.compiler,
    components: bundle.components,
  };
}

/**
 * Load all plugins and register them with the module system
 */
export async function loadAllPlugins(): Promise<PluginLoadResult> {
  const result: PluginLoadResult = {
    loaded: [],
    failed: [],
  };

  try {
    // Log which path we're using
    const effectivePath = configuredPluginsPath || '(default)';
    logger.debug(`Loading plugins from path: ${effectivePath}`);

    const plugins = await listPlugins();
    logger.debug(`Found ${plugins.length} plugins`);

    if (plugins.length === 0) {
      return result;
    }

    const loadedPlugins: BundledModule[] = [];

    for (const pluginInfo of plugins) {
      try {
        const plugin = await loadPlugin(pluginInfo);

        // Convert to BundledModule format
        const bundledModule: BundledModule = {
          manifest: plugin.manifest,
          nodes: plugin.nodes,
          runtime: plugin.runtime,
          compiler: plugin.compiler,
        };

        loadedPlugins.push(bundledModule);

        // Register UI components if present
        if (plugin.components) {
          registerPluginComponents(plugin.manifest, plugin.components);
        }

        result.loaded.push(pluginInfo.id);
        logger.debug(`Successfully loaded plugin: ${pluginInfo.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.failed.push({ id: pluginInfo.id, error: errorMessage });
        logger.error(`Failed to load plugin ${pluginInfo.id}`, { error });
      }
    }

    // Merge with existing bundled modules
    if (loadedPlugins.length > 0) {
      const existingModules = getBundledModulesArray();
      const allModules = [...existingModules, ...loadedPlugins];
      registerBundledModules(allModules);
      logger.debug(`Registered ${loadedPlugins.length} plugins with module system`);

      // CRITICAL: Also load modules into the ModuleLoader singleton
      // This ensures the modules are available for compilation when API jobs run
      const moduleLoader = getModuleLoader();
      const loadResult = await loadBundledModules(moduleLoader, allModules);
      logger.debug(`Loaded ${loadResult.loaded} modules into ModuleLoader`, { skipped: loadResult.skipped, errors: loadResult.errors.length });

      // Register nodes without custom components using GenericNode as fallback
      const { GenericNode } = ZippUIComponents;
      for (const module of allModules) {
        for (const node of module.nodes) {
          // Check if this node has a custom component mapping
          const hasCustomComponent = module.manifest.ui?.nodes?.some(
            m => m.nodeType === node.id
          );
          if (!hasCustomComponent) {
            registerNodeComponent(node.id, GenericNode);
            logger.debug(`Registered node type with GenericNode: ${node.id}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Failed to load plugins', { error });
  }

  return result;
}

/**
 * Register a plugin's UI components
 */
function registerPluginComponents(
  manifest: ModuleManifest,
  components: Record<string, React.ComponentType<unknown>>
): void {
  // Register components by name
  for (const [name, component] of Object.entries(components)) {
    registerComponentByName(name, component);
  }

  // Register node types based on manifest
  if (manifest.ui?.nodes) {
    for (const mapping of manifest.ui.nodes) {
      const component = components[mapping.componentName];
      if (component) {
        registerNodeComponent(mapping.nodeType, component);
        logger.debug(`Registered node type: ${mapping.nodeType} -> ${mapping.componentName}`);
      } else {
        logger.warn(`Component not found: ${mapping.componentName} for node type: ${mapping.nodeType}`);
      }
    }
  }
}

// ============================================
// Plugin Management
// ============================================

/**
 * Create a new plugin scaffold
 */
export async function createPluginScaffold(pluginId: string, customPath?: string): Promise<string> {
  return invoke<string>('create_plugin_scaffold', {
    pluginId,
    customPath: customPath ?? configuredPluginsPath
  });
}

/**
 * Delete a plugin
 */
export async function deletePlugin(pluginId: string, customPath?: string): Promise<void> {
  return invoke<void>('delete_plugin', {
    pluginId,
    customPath: customPath ?? configuredPluginsPath
  });
}

/**
 * Check if plugins are supported (Tauri environment)
 */
export function isPluginSystemAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

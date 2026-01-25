/**
 * Dynamic Module Loading
 *
 * All modules are now loaded at runtime from the plugins directory.
 * This allows modules to be modified and rebuilt without recompiling the app.
 *
 * Modules are loaded when the user starts the app from the splash screen.
 */

import { registerBundledModules } from 'zipp-core';
import { loadAllPlugins, isPluginSystemAvailable, setPluginsPath } from './pluginLoader';
import { moduleLogger } from './utils/logger';

// ============================================
// Initialize Empty Module Registry
// ============================================

// Register an empty array initially - modules will be loaded at runtime
registerBundledModules([]);

// Log initialization in development (debug level is only shown in dev)
moduleLogger.debug('Initialized empty module registry');
moduleLogger.debug('Modules will be loaded from plugins directory at runtime');

// ============================================
// Runtime Plugin Loading
// ============================================

let pluginsLoaded = false;

/**
 * Load runtime plugins from the plugins directory.
 * This should be called after the app has initialized (from splash screen).
 * @param appDataPath - Optional custom app data directory path (plugins are in {path}/plugins)
 * Returns a promise that resolves when all plugins are loaded.
 */
export async function loadRuntimePlugins(appDataPath?: string): Promise<void> {
  if (pluginsLoaded) {
    moduleLogger.debug('Plugins already loaded, skipping');
    return;
  }

  if (!isPluginSystemAvailable()) {
    moduleLogger.debug('Plugin system not available (not in Tauri environment)');
    return;
  }

  // Set the configured app data path (Rust backend derives plugins path from it)
  if (appDataPath) {
    setPluginsPath(appDataPath);
    moduleLogger.debug(`Using custom app data path: ${appDataPath}`);
  } else {
    moduleLogger.debug('Using default app data path');
  }

  try {
    moduleLogger.debug('Loading runtime plugins...');
    const result = await loadAllPlugins();

    if (result.loaded.length > 0) {
      moduleLogger.info(`Loaded ${result.loaded.length} plugins`, result.loaded);
      // Note: Plugin components are already registered in loadAllPlugins()
      // via registerPluginComponents(). We do NOT call registerModuleUIComponents()
      // here because that would overwrite the plugin components with the bundled
      // ones from zipp-core/modules/*/ui/.
    }

    if (result.failed.length > 0) {
      moduleLogger.warn('Failed to load some plugins', result.failed);
    }

    pluginsLoaded = true;
  } catch (error) {
    moduleLogger.error('Error loading plugins', error);
  }
}

/**
 * Reload plugins (e.g., after rebuilding or changing the app data path)
 */
export async function reloadPlugins(appDataPath?: string): Promise<void> {
  pluginsLoaded = false;
  await loadRuntimePlugins(appDataPath);
}

/**
 * Check if plugins have been loaded
 */
export function arePluginsLoaded(): boolean {
  return pluginsLoaded;
}

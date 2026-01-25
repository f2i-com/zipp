import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import ServicesPanel from './ServicesPanel';
import { createLogger } from '../utils/logger';

const logger = createLogger('Splash');

interface SplashScreenProps {
  onStart: (appDataPath?: string) => void;
}

interface BuildLog {
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: Date;
}

interface CopyPluginsResult {
  copied: string[];
  skipped: string[];
  failed: Array<{ id: string; error: string }>;
}

export default function SplashScreen({ onStart }: SplashScreenProps) {
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [buildLogs, setBuildLogs] = useState<BuildLog[]>([]);
  const [buildComplete, setBuildComplete] = useState(false);
  const [buildError, setBuildError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pluginCount, setPluginCount] = useState(0);
  const [appDataPath, setAppDataPath] = useState<string | undefined>(undefined);
  const [defaultAppDataPath, setDefaultAppDataPath] = useState<string>('');
  const [copyExistingData, setCopyExistingData] = useState(true);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const handleRebuildRef = useRef<(() => void) | null>(null);

  const addLog = useCallback((type: BuildLog['type'], message: string) => {
    setBuildLogs(prev => [...prev, { type, message, timestamp: new Date() }]);
  }, []);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [buildLogs]);

  // Refresh plugin count for the current path
  const refreshPluginCount = useCallback(async (path?: string) => {
    try {
      const plugins = await invoke<Array<{ id: string }>>('list_plugins', {
        customPath: path,
      });
      setPluginCount(plugins.length);
      return plugins.length;
    } catch (error) {
      logger.error('Error getting plugin count', { error });
      setPluginCount(0);
      return 0;
    }
  }, []);

  // Initialize - read install config and use bundled plugins if available
  useEffect(() => {
    const initialize = async () => {
      try {
        // Get default app data path
        const defaultPath = await invoke<string>('get_default_app_data_dir').catch(() => 'unknown');
        logger.debug(`Default app data directory: ${defaultPath}`);

        // Get bundled plugins path (from install location)
        let bundledPath: string | undefined;
        try {
          bundledPath = await invoke<string>('get_bundled_plugins_dir');
          logger.debug(`Bundled plugins directory: ${bundledPath}`);
        } catch (e) {
          logger.debug('No bundled plugins directory (dev mode)', { error: e });
        }

        // Read install configuration (set by installer or user)
        let configuredPath: string | undefined;
        try {
          const installConfig = await invoke<{ appDataPath?: string; pluginsPath?: string }>('get_install_config');
          logger.debug('Install config loaded', { config: installConfig });
          // Use appDataPath if set, fall back to pluginsPath for migration
          configuredPath = installConfig.appDataPath;
        } catch (e) {
          logger.debug('No install config found', { error: e });
        }

        // Determine which path to use:
        // 1. If install config has a path, use that
        // 2. Otherwise, if bundled plugins exist, use bundled path directly
        // 3. Fall back to default path
        let effectivePath: string | undefined;

        if (configuredPath) {
          logger.debug(`Using configured app data path: ${configuredPath}`);
          effectivePath = configuredPath;
        } else if (bundledPath) {
          // Check if bundled plugins actually exist there
          const hasBundled = await invoke<boolean>('has_bundled_plugins');
          logger.debug(`Has bundled plugins: ${hasBundled}`);

          if (hasBundled) {
            // For bundled plugins, derive app data path from plugins path
            // bundledPath is something like .../plugins, so parent is app data
            const bundledAppDataPath = bundledPath.replace(/[/\\]plugins$/, '');
            logger.debug(`Using bundled app data path (no config set): ${bundledAppDataPath}`);
            effectivePath = bundledAppDataPath;

            // Save this to config so it persists
            try {
              await invoke('set_install_config', { config: { appDataPath: bundledAppDataPath } });
              logger.debug('Saved bundled path to config');
            } catch (e) {
              logger.debug('Could not save config', { error: e });
            }
          } else {
            logger.debug('No bundled plugins found, using default path');
          }
        }

        // Set the paths for UI
        if (effectivePath) {
          setAppDataPath(effectivePath);
          setDefaultAppDataPath(effectivePath);
        } else {
          setDefaultAppDataPath(defaultPath);
        }

        // List bundled plugins for debugging
        try {
          const bundledList = await invoke<string[]>('list_bundled_plugins');
          logger.debug('Bundled plugins available', { plugins: bundledList });
        } catch (e) {
          logger.debug('Could not list bundled plugins', { error: e });
        }

        // Get plugin count for the effective path
        await refreshPluginCount(effectivePath);

        // Check if any plugins need rebuilding (first launch or source updated)
        try {
          const plugins = await invoke<Array<{ id: string; has_bundle: boolean }>>('list_plugins', {
            customPath: effectivePath,
          });

          let needsRebuild = false;
          for (const plugin of plugins) {
            if (!plugin.has_bundle) {
              logger.debug(`Plugin needs build (no bundle): ${plugin.id}`);
              needsRebuild = true;
              break;
            }
            // Check if source is newer than bundle
            const needsUpdate = await invoke<boolean>('plugin_needs_rebuild', {
              pluginId: plugin.id,
              customPath: effectivePath,
            });
            if (needsUpdate) {
              logger.debug(`Plugin needs rebuild (source updated): ${plugin.id}`);
              needsRebuild = true;
              break;
            }
          }

          if (needsRebuild && plugins.length > 0) {
            logger.debug('Auto-building plugins on first launch...');
            setIsInitializing(false);
            // Trigger auto-rebuild
            setTimeout(() => {
              handleRebuildRef.current?.();
            }, 100);
            return; // Don't set isInitializing to false yet
          }
        } catch (e) {
          logger.debug('Could not check plugin rebuild status', { error: e });
        }

      } catch (error) {
        logger.error('Initialization error', { error });
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, [refreshPluginCount]);

  const handleRebuild = useCallback(async () => {
    setIsRebuilding(true);
    setBuildLogs([]);
    setBuildComplete(false);
    setBuildError(false);

    const effectivePath = appDataPath || defaultAppDataPath;
    addLog('info', `Starting plugin rebuild...`);
    addLog('info', `Using app data path: ${effectivePath}`);

    try {
      // Get list of plugins
      const plugins = await invoke<Array<{ id: string; has_bundle: boolean }>>('list_plugins', {
        customPath: appDataPath,
      });

      addLog('info', `Found ${plugins.length} plugins`);

      // Import the plugin compiler
      const { compileAllPlugins } = await import('../services/pluginCompiler');

      // Compile all plugins
      const result = await compileAllPlugins(appDataPath, (pluginId, status, message) => {
        if (status === 'start') {
          addLog('info', `Building ${pluginId}...`);
        } else if (status === 'success') {
          addLog('success', `✓ ${pluginId} built successfully`);
        } else if (status === 'error') {
          addLog('error', `✗ ${pluginId}: ${message}`);
        } else if (status === 'skip') {
          addLog('warning', `⊘ ${pluginId}: ${message}`);
        }
      });

      addLog('info', '');
      addLog('info', '════════════════════════════════════════');
      addLog('success', `Build complete: ${result.successful}/${result.total} plugins built`);

      if (result.failed > 0) {
        addLog('error', `${result.failed} plugin(s) failed to build`);
        setBuildError(true);
      }

      setBuildComplete(true);
    } catch (error) {
      addLog('error', `Build failed: ${error}`);
      setBuildError(true);
      setBuildComplete(true);
    }

    setIsRebuilding(false);
  }, [appDataPath, defaultAppDataPath, addLog]);

  // Keep ref updated for auto-rebuild
  useEffect(() => {
    handleRebuildRef.current = handleRebuild;
  }, [handleRebuild]);

  const handleStart = useCallback(() => {
    const effectivePath = appDataPath || undefined;
    logger.debug(`Starting app with app data path: ${effectivePath || '(default)'}`);
    onStart(effectivePath);
  }, [onStart, appDataPath]);

  const handleChangeFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select App Data Folder',
        defaultPath: appDataPath || defaultAppDataPath,
      });

      if (selected && typeof selected === 'string') {
        setIsChangingFolder(true);
        const oldPath = appDataPath || defaultAppDataPath;
        const newPath = selected;

        logger.debug(`Changing app data folder from ${oldPath} to ${newPath}`);

        // Copy existing data if checkbox is checked
        if (copyExistingData && oldPath !== newPath) {
          try {
            // Copy plugins folder
            const oldPluginsPath = oldPath.endsWith('plugins') ? oldPath : `${oldPath}/plugins`;
            addLog('info', `Copying plugins to ${newPath}/plugins...`);
            const result = await invoke<CopyPluginsResult>('copy_plugins_to_folder', {
              sourcePath: oldPluginsPath,
              destPath: `${newPath}/plugins`,
              force: false,
            });

            if (result.copied.length > 0) {
              addLog('success', `Copied ${result.copied.length} plugins`);
            }
            if (result.skipped.length > 0) {
              addLog('warning', `Skipped ${result.skipped.length} (already exist)`);
            }
            if (result.failed.length > 0) {
              addLog('error', `Failed to copy ${result.failed.length} plugins`);
            }
          } catch (error) {
            logger.error('Error copying data', { error });
            addLog('error', `Failed to copy data: ${error}`);
          }
        }

        // Update the app data path
        setAppDataPath(newPath);

        // Save to install config
        try {
          logger.debug('Saving new app data path to config...');
          const configToSave = { appDataPath: newPath };
          logger.debug('Config object', { config: configToSave });

          await invoke('set_install_config', { config: configToSave });
          logger.debug('Config saved successfully!');

          // Verify save by reading back
          const verifyConfig = await invoke<{ appDataPath?: string }>('get_install_config');
          logger.debug('Verified config after save', { config: verifyConfig });

          if (verifyConfig.appDataPath !== newPath) {
            logger.error(`WARNING: Saved path does not match! Expected: ${newPath}, Got: ${verifyConfig.appDataPath}`);
            addLog('warning', 'Config may not have saved correctly');
          }
        } catch (error) {
          logger.error('Failed to save config', { error });
          addLog('error', `Failed to save config: ${error}`);
        }

        // Refresh plugin count
        await refreshPluginCount(newPath);
        setIsChangingFolder(false);
      }
    } catch (error) {
      logger.error('Error selecting folder', { error });
      setIsChangingFolder(false);
    }
  }, [appDataPath, defaultAppDataPath, copyExistingData, refreshPluginCount, addLog]);

  const currentPath = appDataPath || defaultAppDataPath;
  const displayPath = currentPath.length > 55
    ? '...' + currentPath.slice(-52)
    : currentPath;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'rgb(var(--bg-primary))' }}>
      {/* Logo/Title - more compact */}
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-1">Zipp</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Visual Workflow Builder</p>
      </div>

      {/* App Data Folder Section - slimmer design */}
      <div className="w-full max-w-xl mb-4">
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-xs text-slate-500 dark:text-slate-400">App Data Folder</span>
              </div>
              <div className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-200/50 dark:bg-slate-900/50 rounded px-2 py-1.5 truncate" title={currentPath}>
                {isInitializing ? 'Loading...' : displayPath}
              </div>
            </div>
            <button
              onClick={handleChangeFolder}
              disabled={isInitializing || isRebuilding || isChangingFolder}
              className="px-2.5 py-1.5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300 rounded transition-colors flex-shrink-0"
            >
              Change
            </button>
          </div>

          {/* Copy existing data checkbox - inline */}
          <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={copyExistingData}
              onChange={(e) => setCopyExistingData(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">Copy existing data when changing folder</span>
          </label>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-1">
          Store your plugins, settings, and data in one place for easy backup and upgrades.
        </p>
      </div>

      {/* Services Panel - Compact horizontal layout */}
      <div className="w-full max-w-2xl mb-4">
        <ServicesPanel disabled={isInitializing || isRebuilding || isChangingFolder} compact />
      </div>

      {/* Main Content Area */}
      {isRebuilding || buildLogs.length > 0 ? (
        /* Build Log View */
        <div className="w-full max-w-2xl flex-1 max-h-[250px] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Build Output</h3>
            {isRebuilding && (
              <div className="flex items-center gap-2 text-blue-500 dark:text-blue-400">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm">Building...</span>
              </div>
            )}
          </div>

          <div
            ref={logContainerRef}
            className="flex-1 bg-white dark:bg-slate-950 rounded-lg border border-slate-300 dark:border-slate-700 p-3 overflow-auto font-mono text-xs"
          >
            {buildLogs.map((log, index) => (
              <div
                key={index}
                className={`${
                  log.type === 'error' ? 'text-red-600 dark:text-red-400' :
                  log.type === 'success' ? 'text-green-600 dark:text-green-400' :
                  log.type === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-slate-600 dark:text-slate-300'
                } ${log.message === '' ? 'h-2' : ''}`}
              >
                {log.message}
              </div>
            ))}
            {isRebuilding && (
              <div className="text-slate-500 dark:text-slate-400 animate-pulse">▌</div>
            )}
          </div>
        </div>
      ) : (
        /* Initial View */
        <div className="text-center mb-2">
          {isInitializing ? (
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Initializing...</span>
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {pluginCount} plugin{pluginCount !== 1 ? 's' : ''} available
            </p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-4">
        {!isRebuilding && (
          <>
            {/* Start Button - changes appearance after build */}
            <button
              onClick={handleStart}
              disabled={isInitializing || isChangingFolder}
              className={`px-6 py-2.5 ${
                buildComplete
                  ? buildError
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-green-600 hover:bg-green-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              } disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {buildComplete && buildError ? 'Continue Anyway' : 'Start'}
            </button>

            <button
              onClick={handleRebuild}
              disabled={isInitializing || isChangingFolder}
              className="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Rebuild Plugins
            </button>
          </>
        )}
      </div>

      {/* Version */}
      <div className="absolute bottom-3 text-slate-500 dark:text-slate-400 text-xs">
        v0.0.1
      </div>
    </div>
  );
}

import { useState, useCallback, useEffect } from 'react';
import type { ProjectConstant, ProjectSettings, AIProvider, ImageProvider, ModuleManifest, ModuleSettingDefinition } from 'zipp-core';
import { getModuleLoader, BUNDLED_MODULES, loadBundledModules } from 'zipp-core';
import { invoke } from '@tauri-apps/api/core';
import { useServices } from '../../hooks/useServices';
import { AppearanceTab, ApiServerTab, SecurityTab, ServicesTab } from './settings';
import { uiLogger as logger } from '../../utils/logger';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProjectSettings;
  constants: ProjectConstant[];
  onUpdateSettings: (updates: Partial<ProjectSettings>) => void;
  onUpdateConstant: (id: string, updates: Partial<ProjectConstant>) => void;
  onCreateConstant: (constant: Omit<ProjectConstant, 'id'>) => void;
  onApplyDefaultsToAllNodes?: () => void;
  onExportSettings?: () => void;
  onImportSettings?: (settings: { settings: ProjectSettings; constants: ProjectConstant[] }) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  moduleSettings?: Record<string, Record<string, unknown>>;
  onUpdateModuleSettings?: (moduleId: string, settings: Record<string, unknown>) => void;
}

const AI_PROVIDERS: { value: AIProvider; label: string; endpoint: string; model: string; apiKeyConstant: string }[] = [
  { value: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', apiKeyConstant: 'OPENAI_API_KEY' },
  { value: 'anthropic', label: 'Anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', apiKeyConstant: 'ANTHROPIC_API_KEY' },
  { value: 'google', label: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', model: 'gemini-2.0-flash', apiKeyConstant: 'GOOGLE_API_KEY' },
  { value: 'openrouter', label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o', apiKeyConstant: 'OPENROUTER_API_KEY' },
  { value: 'groq', label: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', apiKeyConstant: 'GROQ_API_KEY' },
  { value: 'ollama', label: 'Ollama (Local)', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3', apiKeyConstant: '' },
  { value: 'lmstudio', label: 'LM Studio (Local)', endpoint: 'http://localhost:1234/v1/chat/completions', model: '', apiKeyConstant: '' },
  { value: 'custom', label: 'Custom', endpoint: '', model: '', apiKeyConstant: '' },
];

const IMAGE_PROVIDERS: { value: string; label: string; endpoint: string; model: string; apiKeyConstant: string }[] = [
  { value: 'openai', label: 'OpenAI GPT Image', endpoint: 'https://api.openai.com/v1/images/generations', model: 'gpt-image-1', apiKeyConstant: 'OPENAI_API_KEY' },
  { value: 'gemini-3-pro', label: 'Gemini 3 Pro', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent', model: 'gemini-3-pro-image-preview', apiKeyConstant: 'GOOGLE_API_KEY' },
  { value: 'gemini-flash', label: 'Gemini 2.5 Flash', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent', model: 'gemini-2.5-flash-preview-05-20', apiKeyConstant: 'GOOGLE_API_KEY' },
  { value: 'gemini-2-flash', label: 'Gemini 2.0 Flash', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', model: 'gemini-2.0-flash-exp', apiKeyConstant: 'GOOGLE_API_KEY' },
  { value: 'comfyui', label: 'ComfyUI (Local)', endpoint: 'http://localhost:8188', model: '', apiKeyConstant: '' },
  { value: 'custom', label: 'Custom', endpoint: '', model: '', apiKeyConstant: '' },
];

const VIDEO_PROVIDERS: { value: string; label: string; endpoint: string }[] = [
  { value: 'comfyui', label: 'ComfyUI (Local)', endpoint: 'http://localhost:8188' },
];

export default function SettingsPanel({
  isOpen,
  onClose,
  settings,
  constants,
  onUpdateSettings,
  onUpdateConstant,
  onCreateConstant,
  onApplyDefaultsToAllNodes,
  onExportSettings,
  onImportSettings,
  onShowToast,
  moduleSettings = {},
  onUpdateModuleSettings,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'defaults' | 'apikeys' | 'constants' | 'security' | 'plugins' | 'api' | 'services'>('appearance');
  const [appDataPath, setAppDataPath] = useState('');
  const [defaultAppDataPath, setDefaultAppDataPath] = useState('');
  const [loadedModules, setLoadedModules] = useState<ModuleManifest[]>([]);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [newConstantName, setNewConstantName] = useState('');
  const [newConstantKey, setNewConstantKey] = useState('');
  const [newConstantValue, setNewConstantValue] = useState('');

  // Services hook - only used for runningCount in sidebar badge
  const { runningCount } = useServices({ autoRefresh: isOpen && activeTab === 'services', refreshInterval: 3000 });

  // API Server running status - just for sidebar badge
  const [apiRunning, setApiRunning] = useState(false);

  // Check API status when panel opens
  useEffect(() => {
    if (isOpen) {
      invoke<{ running: boolean }>('get_api_status')
        .then(status => setApiRunning(status.running))
        .catch(() => setApiRunning(false));
    }
  }, [isOpen]);

  // Load modules when panel opens
  useEffect(() => {
    if (isOpen) {
      const loader = getModuleLoader();
      // Load bundled modules if not already loaded
      loadBundledModules(loader, BUNDLED_MODULES).then(() => {
        // Get all loaded module manifests
        const manifests: ModuleManifest[] = [];
        for (const [, module] of loader.modules) {
          manifests.push(module.manifest);
        }
        setLoadedModules(manifests);
      }).catch((err) => {
        logger.error('Failed to load bundled modules', { error: err });
      });
    }
  }, [isOpen]);

  // Load app data path when panel opens
  useEffect(() => {
    if (isOpen) {
      // Load default app data path
      invoke<string>('get_default_app_data_dir')
        .then(path => setDefaultAppDataPath(path))
        .catch(e => logger.error('Failed to get default app data path', { error: e }));

      // Load configured app data path from install config (set by splash screen)
      invoke<{ appDataPath?: string }>('get_install_config')
        .then(config => {
          if (config.appDataPath) {
            setAppDataPath(config.appDataPath);
          } else {
            setAppDataPath(settings.appDataPath || '');
          }
        })
        .catch(() => {
          // Fall back to project settings
          setAppDataPath(settings.appDataPath || '');
        });
    }
  }, [isOpen, settings.appDataPath]);

  const handleAppDataPathChange = useCallback((path: string) => {
    setAppDataPath(path);
  }, []);

  const handleAppDataPathSave = useCallback(() => {
    onUpdateSettings({ appDataPath: appDataPath || undefined });
    // Also save to install config for persistence across installs
    invoke('set_install_config', { config: { appDataPath: appDataPath || null } })
      .catch(e => logger.error('Failed to save app data path to install config', { error: e }));
    onShowToast?.('App data path saved. Restart the app to apply changes.', 'success');
  }, [appDataPath, onUpdateSettings, onShowToast]);

  const handleAppDataPathReset = useCallback(() => {
    setAppDataPath('');
    onUpdateSettings({ appDataPath: undefined });
    // Also clear from install config
    invoke('set_install_config', { config: { appDataPath: null } })
      .catch(e => logger.error('Failed to clear app data path from install config', { error: e }));
    onShowToast?.('App data path reset to default.', 'success');
  }, [onUpdateSettings, onShowToast]);

  const handleBrowseAppDataPath = useCallback(async () => {
    try {
      const result = await invoke<string | null>('plugin:zipp-filesystem|pick_folder');
      if (result) {
        setAppDataPath(result);
      }
    } catch (e) {
      logger.error('Failed to pick folder', { error: e });
    }
  }, []);

  const handleModuleSettingChange = useCallback((moduleId: string, settingKey: string, value: unknown) => {
    if (onUpdateModuleSettings) {
      const currentSettings = moduleSettings[moduleId] || {};
      onUpdateModuleSettings(moduleId, { ...currentSettings, [settingKey]: value });
    }
  }, [moduleSettings, onUpdateModuleSettings]);

  const handleExportSettings = useCallback(() => {
    if (onExportSettings) {
      onExportSettings();
    } else {
      // Default export behavior
      const exportData = {
        settings,
        constants: constants.map(c => ({ ...c, value: c.isSecret ? '' : c.value })), // Don't export secret values
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zipp-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      onShowToast?.('Settings exported to Downloads', 'success');
    }
  }, [settings, constants, onExportSettings, onShowToast]);

  const handleImportSettings = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (data.settings && onImportSettings) {
            onImportSettings(data);
            onShowToast?.('Settings imported successfully', 'success');
          } else if (data.settings) {
            // Apply settings directly
            onUpdateSettings(data.settings);
            // Import constants (but preserve existing secret values)
            if (data.constants) {
              data.constants.forEach((imported: ProjectConstant) => {
                const existing = constants.find(c => c.key === imported.key);
                if (existing) {
                  // Update existing constant, preserve value if it's secret and import has empty value
                  const value = imported.isSecret && !imported.value ? existing.value : imported.value;
                  onUpdateConstant(existing.id, { ...imported, value });
                } else {
                  // Create new constant
                  onCreateConstant(imported);
                }
              });
            }
            onShowToast?.('Settings imported successfully', 'success');
          }
        } catch (err) {
          logger.error('Failed to import settings', { error: err });
          onShowToast?.('Failed to import settings. Check file format.', 'error');
        }
      }
    };
    input.click();
  }, [constants, onUpdateSettings, onUpdateConstant, onCreateConstant, onImportSettings, onShowToast]);

  const handleAIProviderChange = useCallback((provider: AIProvider) => {
    const providerInfo = AI_PROVIDERS.find(p => p.value === provider);
    if (providerInfo) {
      // Only update endpoint if it's empty or matches a known default
      const currentEndpoint = settings.defaultAIEndpoint || '';
      const knownDefaults = AI_PROVIDERS.map(p => p.endpoint).filter(Boolean);
      const isDefaultEndpoint = !currentEndpoint || knownDefaults.some(d => currentEndpoint === d);

      const updates: Partial<typeof settings> = {
        defaultAIProvider: provider,
        defaultAIModel: providerInfo.model,
        defaultAIApiKeyConstant: providerInfo.apiKeyConstant,
      };

      if (isDefaultEndpoint) {
        updates.defaultAIEndpoint = providerInfo.endpoint;
      }

      onUpdateSettings(updates);
    }
  }, [onUpdateSettings, settings.defaultAIEndpoint]);

  const handleImageProviderChange = useCallback((provider: string) => {
    const providerInfo = IMAGE_PROVIDERS.find(p => p.value === provider);
    if (providerInfo) {
      // Only update endpoint if it's empty or matches a known default
      const currentEndpoint = settings.defaultImageEndpoint || '';
      const knownDefaults = IMAGE_PROVIDERS.map(p => p.endpoint).filter(Boolean);
      const isDefaultEndpoint = !currentEndpoint || knownDefaults.some(d => currentEndpoint === d);

      const updates: Partial<typeof settings> = {
        defaultImageProvider: provider as ImageProvider,
        defaultImageModel: providerInfo.model,
        defaultImageApiKeyConstant: providerInfo.apiKeyConstant,
      };

      if (isDefaultEndpoint) {
        updates.defaultImageEndpoint = providerInfo.endpoint;
      }

      onUpdateSettings(updates);
    }
  }, [onUpdateSettings, settings.defaultImageEndpoint]);

  const handleVideoProviderChange = useCallback((provider: string) => {
    const providerInfo = VIDEO_PROVIDERS.find(p => p.value === provider);
    if (providerInfo) {
      // Only update endpoint if it's empty or matches a known default
      const currentEndpoint = settings.defaultVideoEndpoint || '';
      const knownDefaults = VIDEO_PROVIDERS.map(p => p.endpoint).filter(Boolean);
      const isDefaultEndpoint = !currentEndpoint || knownDefaults.some(d => currentEndpoint === d);

      const updates: Partial<typeof settings> = {
        defaultVideoProvider: provider,
      };

      if (isDefaultEndpoint) {
        updates.defaultVideoEndpoint = providerInfo.endpoint;
      }

      onUpdateSettings(updates);
    }
  }, [onUpdateSettings, settings.defaultVideoEndpoint]);

  const handleAddConstant = useCallback(() => {
    if (newConstantName && newConstantKey) {
      onCreateConstant({
        name: newConstantName,
        key: newConstantKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        value: newConstantValue,
        category: 'custom',
        isSecret: false,
      });
      setNewConstantName('');
      setNewConstantKey('');
      setNewConstantValue('');
    }
  }, [newConstantName, newConstantKey, newConstantValue, onCreateConstant]);

  if (!isOpen) return null;

  const apiKeyConstants = constants.filter(c => c.category === 'api_key');
  const customConstants = constants.filter(c => c.category !== 'api_key');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-5xl h-[80vh] overflow-hidden flex">
        {/* Sidebar with tabs */}
        <div className="w-48 flex-shrink-0 bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-700 flex flex-col">
          {/* Header */}
          <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Settings</h2>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'appearance'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Appearance
            </button>
            <button
              onClick={() => setActiveTab('defaults')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'defaults'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
              </svg>
              Providers
            </button>
            <button
              onClick={() => setActiveTab('apikeys')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'apikeys'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              API Keys
            </button>
            <button
              onClick={() => setActiveTab('constants')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'constants'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Constants
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'security'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Security
            </button>
            <button
              onClick={() => setActiveTab('plugins')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'plugins'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
              Plugins
            </button>
            <button
              onClick={() => setActiveTab('api')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'api'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              API Server
              {apiRunning && (
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse ml-auto" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors text-left flex items-center gap-2 ${
                activeTab === 'services'
                  ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              Services
              {runningCount > 0 && (
                <span className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-xs rounded-full ml-auto">
                  {runningCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-medium text-slate-700 dark:text-slate-200 capitalize">{activeTab === 'apikeys' ? 'API Keys' : activeTab === 'api' ? 'API Server' : activeTab}</h3>
          </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'appearance' && <AppearanceTab />}


          {activeTab === 'defaults' && (
            <div className="space-y-6">
              {/* Info Banner */}
              <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
                <p className="text-slate-400 text-sm">
                  Configure endpoints on individual AI/LLM and Image Gen nodes. Mix local (Ollama, ComfyUI) with cloud (OpenAI, Anthropic) as needed.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {onApplyDefaultsToAllNodes && (
                  <button
                    onClick={onApplyDefaultsToAllNodes}
                    className="btn btn-md bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Apply Defaults to All Nodes
                  </button>
                )}
                <button
                  onClick={handleExportSettings}
                  className="btn btn-secondary btn-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Settings
                </button>
                <button
                  onClick={handleImportSettings}
                  className="btn btn-secondary btn-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import Settings
                </button>
              </div>

              {/* UI Preferences */}
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  UI Preferences
                </h3>

              </div>

              {/* AI/LLM Defaults */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                  </svg>
                  AI / LLM Defaults
                </h3>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default Provider</label>
                  <select
                    value={settings.defaultAIProvider || 'openai'}
                    onChange={(e) => handleAIProviderChange(e.target.value as AIProvider)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    {AI_PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default Endpoint</label>
                  <input
                    type="text"
                    value={settings.defaultAIEndpoint || ''}
                    onChange={(e) => onUpdateSettings({ defaultAIEndpoint: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    placeholder="https://api.openai.com/v1/chat/completions"
                  />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default Model</label>
                  <input
                    type="text"
                    value={settings.defaultAIModel || ''}
                    onChange={(e) => onUpdateSettings({ defaultAIModel: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                    placeholder="gpt-4o"
                  />
                </div>
              </div>

              {/* Image Gen Defaults */}
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-pink-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                  Image Generation Defaults
                </h3>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default Provider</label>
                  <select
                    value={settings.defaultImageProvider || 'openai'}
                    onChange={(e) => handleImageProviderChange(e.target.value as ImageProvider)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-pink-500"
                  >
                    {IMAGE_PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default Endpoint</label>
                  <input
                    type="text"
                    value={settings.defaultImageEndpoint || ''}
                    onChange={(e) => onUpdateSettings({ defaultImageEndpoint: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-pink-500 font-mono"
                    placeholder="https://api.openai.com/v1/images/generations"
                  />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default Model</label>
                  <input
                    type="text"
                    value={settings.defaultImageModel || ''}
                    onChange={(e) => onUpdateSettings({ defaultImageModel: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-pink-500"
                    placeholder="gpt-image-1"
                  />
                </div>
              </div>

              {/* Video Gen Defaults */}
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Video Generation Defaults
                </h3>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default Provider</label>
                  <select
                    value={settings.defaultVideoProvider || 'comfyui'}
                    onChange={(e) => handleVideoProviderChange(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                  >
                    {VIDEO_PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Default ComfyUI Server</label>
                  <input
                    type="text"
                    value={settings.defaultVideoEndpoint || ''}
                    onChange={(e) => onUpdateSettings({ defaultVideoEndpoint: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-orange-500 font-mono"
                    placeholder="http://localhost:8188"
                  />
                  <p className="text-slate-500 text-xs mt-1">
                    This endpoint is used for Video Gen nodes with embedded or loaded ComfyUI workflows.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'apikeys' && (
            <div className="space-y-4">
              <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
                <p className="text-slate-400 text-sm">
                  Store your API keys here. They will be used automatically when a node references them by name (e.g., OPENAI_API_KEY).
                </p>
              </div>

              {apiKeyConstants.map((constant) => (
                <div key={constant.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">{constant.name}</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={constant.value}
                        onChange={(e) => onUpdateConstant(constant.id, { value: e.target.value })}
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-yellow-500 font-mono"
                        placeholder={`Enter ${constant.key}...`}
                      />
                      <span className="px-2 py-2 bg-slate-200 dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 font-mono">
                        {constant.key}
                      </span>
                    </div>
                  </div>
                  {constant.value && (
                    <button
                      onClick={() => onUpdateConstant(constant.id, { value: '' })}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-red-400"
                      title="Clear"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'constants' && (
            <div className="space-y-4">
              <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
                <p className="text-slate-400 text-sm">
                  Create custom constants for endpoints, models, or other values. Reference them by name in node configurations for easy updates.
                </p>
              </div>

              {/* Add New Constant */}
              <div className="bg-slate-100/50 dark:bg-slate-700/30 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium text-slate-400">Add New Constant</h4>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newConstantName}
                    onChange={(e) => setNewConstantName(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Display Name"
                  />
                  <input
                    type="text"
                    value={newConstantKey}
                    onChange={(e) => setNewConstantKey(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                    placeholder="CONSTANT_KEY"
                  />
                  <input
                    type="text"
                    value={newConstantValue}
                    onChange={(e) => setNewConstantValue(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Value"
                  />
                </div>
                <button
                  onClick={handleAddConstant}
                  disabled={!newConstantName || !newConstantKey}
                  className="btn btn-primary btn-sm"
                >
                  Add Constant
                </button>
              </div>

              {/* Existing Constants */}
              {customConstants.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-400">Custom Constants</h4>
                  {customConstants.map((constant) => (
                    <div key={constant.id} className="flex items-center gap-2 bg-slate-100/50 dark:bg-slate-700/30 rounded px-3 py-2">
                      <span className="text-slate-400 text-sm flex-shrink-0">{constant.name}</span>
                      <span className="px-1.5 py-0.5 bg-slate-600 rounded text-xs text-slate-400 font-mono">{constant.key}</span>
                      <span className="text-slate-500 text-sm flex-1 truncate">{constant.value || '(empty)'}</span>
                      <input
                        type="text"
                        value={constant.value}
                        onChange={(e) => onUpdateConstant(constant.id, { value: e.target.value })}
                        className="w-40 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                        placeholder="Value"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'security' && (
            <SecurityTab
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onShowToast={onShowToast}
            />
          )}
          {activeTab === 'plugins' && (
            <div className="space-y-6">
              {/* Info Banner */}
              <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Configure where Zipp stores its data including plugins, settings, and other files.
                  Setting a custom path allows you to keep your data between app installs and upgrades.
                </p>
              </div>

              {/* App Data Path Configuration */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  App Data Folder
                </h3>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Custom App Data Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={appDataPath}
                      onChange={(e) => handleAppDataPathChange(e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                      placeholder={defaultAppDataPath || 'Using default path...'}
                    />
                    <button
                      onClick={handleBrowseAppDataPath}
                      className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm rounded transition-colors"
                      title="Browse for folder"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    Plugins stored in: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{'{path}'}/plugins</code>. Changes require app restart.
                  </p>
                </div>

                {/* Default Path Display */}
                <div className="bg-slate-100/50 dark:bg-slate-700/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 text-xs">Default path:</span>
                      <p className="text-slate-600 dark:text-slate-400 text-sm font-mono mt-0.5 break-all">
                        {defaultAppDataPath || 'Loading...'}
                      </p>
                    </div>
                    {defaultAppDataPath && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(defaultAppDataPath);
                          onShowToast?.('Path copied to clipboard', 'success');
                        }}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        title="Copy path"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleAppDataPathSave}
                    disabled={appDataPath === (settings.appDataPath || '')}
                    className="btn btn-md bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Path
                  </button>
                  {(appDataPath || settings.appDataPath) && (
                    <button
                      onClick={handleAppDataPathReset}
                      className="btn btn-secondary btn-md"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>

              {/* Loaded Plugins List */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Loaded Plugins ({loadedModules.length})
                </h3>

                {loadedModules.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 bg-slate-100/50 dark:bg-slate-800/30 rounded-lg">
                    <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p className="text-sm">No plugins loaded</p>
                    <p className="text-xs mt-1">Add plugins to the plugins directory and restart</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {loadedModules.map((module) => (
                      <div key={module.id} className="bg-slate-100/50 dark:bg-slate-700/30 rounded-lg overflow-hidden">
                        {/* Plugin Header */}
                        <button
                          onClick={() => setExpandedModule(expandedModule === module.id ? null : module.id)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              module.color ? `bg-${module.color}-600/30` : 'bg-slate-300/50 dark:bg-slate-600/30'
                            }`}>
                              <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                            <div className="text-left">
                              <div className="text-slate-700 dark:text-slate-200 font-medium text-sm">{module.name}</div>
                              <div className="text-slate-500 text-xs">
                                {module.nodes.length} nodes • v{module.version}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-600 rounded text-xs text-slate-600 dark:text-slate-400">
                              {module.category || 'Custom'}
                            </span>
                            <svg
                              className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${expandedModule === module.id ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {/* Plugin Details (Expanded) */}
                        {expandedModule === module.id && (
                          <div className="px-4 pb-4 border-t border-slate-300 dark:border-slate-600/50">
                            {/* Description */}
                            {module.description && (
                              <p className="text-slate-500 dark:text-slate-400 text-sm mt-3 mb-4">{module.description}</p>
                            )}

                            {/* Node List */}
                            <div className="mb-4">
                              <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-2">Nodes</h5>
                              <div className="flex flex-wrap gap-1.5">
                                {module.nodes.map((nodeId) => (
                                  <span key={nodeId} className="px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded text-xs text-slate-600 dark:text-slate-400">
                                    {nodeId}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Plugin Settings */}
                            {module.settings && Object.keys(module.settings).length > 0 && (
                              <div>
                                <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-2">Settings</h5>
                                <div className="space-y-3">
                                  {Object.entries(module.settings).map(([key, setting]) => (
                                    <ModuleSettingField
                                      key={key}
                                      settingKey={key}
                                      setting={setting}
                                      value={moduleSettings[module.id]?.[key] ?? setting.default}
                                      onChange={(value) => handleModuleSettingChange(module.id, key, value)}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Permissions */}
                            {module.permissions && module.permissions.length > 0 && (
                              <div className="mt-4">
                                <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-2">Permissions</h5>
                                <div className="flex flex-wrap gap-1.5">
                                  {module.permissions.map((perm) => (
                                    <span key={perm} className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 border border-amber-400/50 dark:border-amber-600/30 rounded text-xs text-amber-700 dark:text-amber-400">
                                      {perm}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Plugin Installation Instructions */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Installing Plugins
                </h3>

                <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    To install a plugin, place its folder in the plugins directory. Each plugin folder should contain:
                  </p>
                  <ul className="text-slate-500 dark:text-slate-400 text-sm space-y-1 list-disc list-inside ml-2">
                    <li><code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">manifest.json</code> - Plugin metadata and configuration</li>
                    <li><code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">nodes/</code> - Node definition JSON files (optional)</li>
                    <li><code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">plugin.bundle.js</code> - Compiled plugin code (optional)</li>
                  </ul>
                  <p className="text-slate-500 text-xs mt-2">
                    Use <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">npm run build:plugin &lt;source&gt; &lt;output&gt;</code> to compile plugins.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <ApiServerTab
              isOpen={isOpen}
              onShowToast={onShowToast}
            />
          )}
          {activeTab === 'services' && (
            <ServicesTab
              isOpen={isOpen}
              settings={settings}
              constants={constants}
              onUpdateSettings={onUpdateSettings}
            />
          )}
        </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <button
              onClick={onClose}
              className="btn btn-primary btn-md"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Module Setting Field Component
// ============================================

interface ModuleSettingFieldProps {
  settingKey: string;
  setting: ModuleSettingDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ModuleSettingField({ settingKey, setting, value, onChange }: ModuleSettingFieldProps) {
  const id = `module-setting-${settingKey}`;

  switch (setting.type) {
    case 'string':
      return (
        <div>
          <label htmlFor={id} className="text-slate-400 text-xs block mb-1">{setting.label}</label>
          <input
            id={id}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            placeholder={setting.description}
          />
          {setting.description && (
            <p className="text-slate-500 text-xs mt-1">{setting.description}</p>
          )}
        </div>
      );

    case 'number':
      return (
        <div>
          <label htmlFor={id} className="text-slate-400 text-xs block mb-1">{setting.label}</label>
          <input
            id={id}
            type="number"
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />
          {setting.description && (
            <p className="text-slate-500 text-xs mt-1">{setting.description}</p>
          )}
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-800"
          />
          <div>
            <label htmlFor={id} className="text-slate-400 text-sm">{setting.label}</label>
            {setting.description && (
              <p className="text-slate-500 text-xs">{setting.description}</p>
            )}
          </div>
        </div>
      );

    case 'secret':
      return (
        <div>
          <label htmlFor={id} className="text-slate-400 text-xs block mb-1">{setting.label}</label>
          <input
            id={id}
            type="password"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-yellow-500 font-mono"
            placeholder={setting.description || 'Enter secret...'}
          />
          {setting.description && (
            <p className="text-slate-500 text-xs mt-1">{setting.description}</p>
          )}
        </div>
      );

    case 'select':
      return (
        <div>
          <label htmlFor={id} className="text-slate-400 text-xs block mb-1">{setting.label}</label>
          <select
            id={id}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {setting.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
          {setting.description && (
            <p className="text-slate-500 text-xs mt-1">{setting.description}</p>
          )}
        </div>
      );

    default:
      return (
        <div>
          <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">{setting.label}</label>
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      );
  }
}

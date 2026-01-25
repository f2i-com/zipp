import { useEffect, useRef } from 'react';
import type { AIFlowBuilderSettings } from '../../hooks/useAIFlowBuilder';

interface AIFlowBuilderSettingsPopoverProps {
  settings: AIFlowBuilderSettings;
  onUpdateSettings: (updates: Partial<AIFlowBuilderSettings>) => void;
  onClose: () => void;
  providers: readonly { id: string; name: string; endpoint: string; model: string }[];
}

export default function AIFlowBuilderSettingsPopover({
  settings,
  onUpdateSettings,
  onClose,
  providers,
}: AIFlowBuilderSettingsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const selectedProvider = providers.find(p => p.id === settings.provider);
  const isLocalProvider = ['ollama', 'lmstudio'].includes(settings.provider);
  const isCustomProvider = settings.provider === 'custom';
  const showEndpoint = isLocalProvider || isCustomProvider;

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-zinc-200">AI Settings</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">Configure AI provider for flow generation</p>
      </div>

      {/* Settings */}
      <div className="p-4 space-y-4">
        {/* Use Project Defaults */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.useProjectDefaults}
            onChange={(e) => onUpdateSettings({ useProjectDefaults: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 dark:border-zinc-600 bg-slate-100 dark:bg-zinc-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-white dark:focus:ring-offset-zinc-800"
          />
          <div>
            <div className="text-sm text-slate-700 dark:text-zinc-300">Use project defaults</div>
            <div className="text-xs text-slate-500 dark:text-zinc-500">Sync with project AI settings</div>
          </div>
        </label>

        {/* Provider */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Provider</label>
          <select
            value={settings.provider}
            onChange={(e) => onUpdateSettings({ provider: e.target.value })}
            disabled={settings.useProjectDefaults}
            className="w-full bg-slate-50 dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Model</label>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => onUpdateSettings({ model: e.target.value })}
            disabled={settings.useProjectDefaults}
            placeholder={selectedProvider?.model || 'model-name'}
            className="w-full bg-slate-50 dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Custom Endpoint (for local/custom providers) */}
        {showEndpoint && (
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Endpoint URL</label>
            <input
              type="text"
              value={settings.customEndpoint}
              onChange={(e) => onUpdateSettings({ customEndpoint: e.target.value })}
              disabled={settings.useProjectDefaults}
              placeholder={selectedProvider?.endpoint || 'http://localhost:8080/v1/chat/completions'}
              className="w-full bg-slate-50 dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        )}

        {/* API Key Constant (for cloud providers) */}
        {!isLocalProvider && (
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5">API Key Constant</label>
            <input
              type="text"
              value={settings.apiKeyConstant}
              onChange={(e) => onUpdateSettings({ apiKeyConstant: e.target.value })}
              disabled={settings.useProjectDefaults}
              placeholder="OPENAI_API_KEY"
              className="w-full bg-slate-50 dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
              Name of the constant in Project Settings that holds your API key
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-zinc-500">
            {isLocalProvider ? 'Local AI' : selectedProvider?.name || 'Unknown'}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 text-slate-700 dark:text-zinc-300 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

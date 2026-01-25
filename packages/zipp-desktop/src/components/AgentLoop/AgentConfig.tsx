/**
 * AgentConfig Component
 *
 * Settings popover for configuring agent behavior.
 */

import { useEffect, useRef } from 'react';
import type { AgentConfig } from '../../hooks/useAgentLoop';

interface AgentConfigPopoverProps {
  config: AgentConfig;
  onUpdateConfig: (updates: Partial<AgentConfig>) => void;
  onClose: () => void;
}

export default function AgentConfigPopover({
  config,
  onUpdateConfig,
  onClose,
}: AgentConfigPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    let mounted = true;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close
    const timeout = setTimeout(() => {
      // Only add listener if still mounted
      if (mounted) {
        document.addEventListener('mousedown', handleClickOutside);
      }
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl z-50"
    >
      <div className="p-4 border-b border-slate-200 dark:border-zinc-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-zinc-200">Agent Settings</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">Configure how the agent operates</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Approval Mode */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm text-slate-700 dark:text-zinc-200">Approval Mode</label>
            <p className="text-xs text-slate-500 dark:text-zinc-500">Pause before each action for your approval</p>
          </div>
          <button
            onClick={() => onUpdateConfig({ approvalMode: !config.approvalMode })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              config.approvalMode ? 'bg-amber-500' : 'bg-slate-300 dark:bg-zinc-600'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                config.approvalMode ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Auto Start Services */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm text-slate-700 dark:text-zinc-200">Auto-Start Services</label>
            <p className="text-xs text-slate-500 dark:text-zinc-500">Automatically start required services</p>
          </div>
          <button
            onClick={() => onUpdateConfig({ autoStartServices: !config.autoStartServices })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              config.autoStartServices ? 'bg-amber-500' : 'bg-slate-300 dark:bg-zinc-600'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                config.autoStartServices ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Auto Run Flows */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm text-slate-700 dark:text-zinc-200">Auto-Run Flows</label>
            <p className="text-xs text-slate-500 dark:text-zinc-500">Automatically execute created flows</p>
          </div>
          <button
            onClick={() => onUpdateConfig({ autoRunFlows: !config.autoRunFlows })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              config.autoRunFlows ? 'bg-amber-500' : 'bg-slate-300 dark:bg-zinc-600'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                config.autoRunFlows ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Max Iterations */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-slate-700 dark:text-zinc-200">Max Iterations</label>
            <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">{config.maxIterations}</span>
          </div>
          <input
            type="range"
            min="1"
            max="25"
            value={config.maxIterations}
            onChange={(e) => onUpdateConfig({ maxIterations: parseInt(e.target.value) })}
            className="w-full h-2 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-600 mt-1">
            <span>1</span>
            <span>25</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
            Maximum number of actions before stopping
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 bg-slate-50 dark:bg-zinc-700/30 border-t border-slate-200 dark:border-zinc-700 rounded-b-xl">
        <p className="text-xs text-slate-500 dark:text-zinc-500">
          {config.approvalMode
            ? '🔒 Agent will pause before each action for your approval'
            : '⚡ Agent will run autonomously until goal is achieved'}
        </p>
      </div>
    </div>
  );
}

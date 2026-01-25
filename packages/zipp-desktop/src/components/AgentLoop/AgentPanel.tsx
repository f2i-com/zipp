/**
 * AgentPanel Component
 *
 * Main panel for the AI Agent loop interface.
 * Shows goal input, attachments, step history, and controls.
 */

import { useState, useRef, useEffect } from 'react';
import type { AgentLoopState, AgentConfig, AgentAttachment } from '../../hooks/useAgentLoop';
import AgentStep from './AgentStep';
import { CopyLink } from '../ui/CopyButton';
import AgentConfigPopover from './AgentConfig';
import { uiLogger as logger } from '../../utils/logger';

interface AgentPanelProps {
  state: AgentLoopState;
  config: AgentConfig;
  isRunning: boolean;
  onStart: (goal: string, attachments?: AgentAttachment[]) => void;
  onStop: () => void;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onUpdateConfig: (updates: Partial<AgentConfig>) => void;
  onReset: () => void;
  pendingAttachments: AgentAttachment[];
  onAddAttachment: (attachment: AgentAttachment) => void;
  onRemoveAttachment: (path: string) => void;
  onClearAttachments: () => void;
}

export default function AgentPanel({
  state,
  config,
  isRunning,
  onStart,
  onStop,
  onApprove,
  onReject,
  onUpdateConfig,
  onReset,
  pendingAttachments,
  onAddAttachment,
  onRemoveAttachment,
  onClearAttachments,
}: AgentPanelProps) {
  const [goalInput, setGoalInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest step
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.steps]);

  // Focus input when idle
  useEffect(() => {
    if (state.status === 'idle') {
      inputRef.current?.focus();
    }
  }, [state.status]);

  const handleStart = () => {
    if (!goalInput.trim()) return;
    onStart(goalInput.trim(), pendingAttachments);
    setGoalInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  // File/folder picker via Tauri dialog
  const handleAddFile = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({
        multiple: false,
        directory: false,
      });
      if (result) {
        onAddAttachment({
          type: 'file',
          path: result,
          name: result.split(/[/\\]/).pop() || result,
        });
      }
    } catch (err) {
      logger.error('File picker error', { error: err });
    }
  };

  const handleAddFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({
        multiple: false,
        directory: true,
      });
      if (result) {
        onAddAttachment({
          type: 'folder',
          path: result,
          name: result.split(/[/\\]/).pop() || result,
        });
      }
    } catch (err) {
      logger.error('Folder picker error', { error: err });
    }
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    idle: { text: 'Ready', color: 'text-slate-500 dark:text-zinc-400' },
    planning: { text: 'Planning...', color: 'text-blue-500 dark:text-blue-400' },
    waiting_approval: { text: 'Awaiting Approval', color: 'text-amber-500 dark:text-amber-400' },
    executing: { text: 'Executing...', color: 'text-purple-500 dark:text-purple-400' },
    assessing: { text: 'Assessing...', color: 'text-cyan-500 dark:text-cyan-400' },
    iterating: { text: 'Iterating...', color: 'text-indigo-500 dark:text-indigo-400' },
    complete: { text: 'Complete', color: 'text-green-500 dark:text-green-400' },
    error: { text: 'Error', color: 'text-red-500 dark:text-red-400' },
  };

  const currentStatus = statusLabel[state.status] || statusLabel.idle;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
      {/* Status bar with config */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${currentStatus.color}`}>
            {currentStatus.text}
          </span>
          {isRunning && (
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Config button */}
          <div className="relative">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="Agent Settings"
            >
              <svg className="w-4 h-4 text-slate-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {showConfig && (
              <AgentConfigPopover
                config={config}
                onUpdateConfig={onUpdateConfig}
                onClose={() => setShowConfig(false)}
              />
            )}
          </div>

          {/* Clear button (when there are steps and not running) */}
          {state.steps.length > 0 && !isRunning && (
            <button
              onClick={onReset}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-colors"
              title="Clear history"
            >
              <svg className="w-4 h-4 text-slate-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}

          {/* Stop button (when running) */}
          {isRunning && (
            <button
              onClick={onStop}
              className="p-1.5 hover:bg-red-900/50 rounded transition-colors"
              title="Stop Agent"
            >
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Goal display (when running) */}
      {state.goal && (
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50">
          <div className="flex items-start gap-2">
            <span className="text-lg">🎯</span>
            <div className="flex-1">
              <p className="text-sm text-slate-700 dark:text-zinc-200">{state.goal}</p>
              {state.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {state.attachments.map((a) => (
                    <span
                      key={a.path}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200 dark:bg-zinc-700 rounded text-xs text-slate-600 dark:text-zinc-300"
                    >
                      {a.type === 'folder' ? '📁' : '📄'} {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-500 mb-1">
              <span>Progress</span>
              <span>{state.progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {state.steps.length === 0 && !isRunning && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-700 dark:text-zinc-300 mb-2">AI Agent Mode</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-500 max-w-xs mx-auto mb-4">
              Describe your goal and the agent will autonomously create and run workflows to achieve it.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                'Describe all images in a folder',
                'Scrape data from a website',
                'Generate images from text prompts',
              ].map((example, i) => (
                <button
                  key={i}
                  onClick={() => setGoalInput(example)}
                  className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 rounded-full transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.steps.map((step) => (
          <AgentStep
            key={step.id}
            step={step}
            isWaitingApproval={state.status === 'waiting_approval' && step.status === 'pending'}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}

        {/* Completion message */}
        {state.status === 'complete' && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
            <span className="text-2xl mb-2 block">🎉</span>
            <p className="text-green-600 dark:text-green-400 font-medium">Goal Achieved!</p>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Completed in {state.steps.length} step{state.steps.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {/* Error message */}
        {state.status === 'error' && state.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-400 font-medium mb-1 flex items-center gap-2">
              Agent Error
              <CopyLink text={state.error} label="Copy" />
            </p>
            <p className="text-sm text-slate-500 dark:text-zinc-400">{state.error}</p>
          </div>
        )}

        <div ref={stepsEndRef} />
      </div>

      {/* Input area (when idle or complete) */}
      {(state.status === 'idle' || state.status === 'complete' || state.status === 'error') && (
        <div className="border-t border-slate-200 dark:border-zinc-700 p-4">
          {/* Attachments */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingAttachments.map((a) => (
                <div
                  key={a.path}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg group"
                >
                  <span className="text-sm">
                    {a.type === 'folder' ? '📁' : '📄'}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-zinc-300 max-w-[150px] truncate">{a.name}</span>
                  <button
                    onClick={() => onRemoveAttachment(a.path)}
                    className="text-slate-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={onClearAttachments}
                className="text-xs text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Attachment buttons */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleAddFile}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs text-slate-600 dark:text-zinc-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Attach File
            </button>
            <button
              onClick={handleAddFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs text-slate-600 dark:text-zinc-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Attach Folder
            </button>
          </div>

          {/* Goal input */}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your goal..."
              className="flex-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
              rows={2}
              disabled={isRunning}
            />
            <button
              onClick={handleStart}
              disabled={!goalInput.trim() || isRunning}
              className="px-5 py-3 h-[60px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-300 dark:disabled:from-zinc-700 disabled:to-slate-300 dark:disabled:to-zinc-700 disabled:cursor-not-allowed text-white rounded-xl transition-all flex items-center justify-center"
              title="Start Agent"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-500 dark:text-zinc-600">
              Press Enter to start, Shift+Enter for new line
            </span>
            <span className="text-xs text-slate-500 dark:text-zinc-600">
              {config.approvalMode ? '🔒 Approval mode' : '⚡ Auto mode'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AgentStep Component
 *
 * Displays a single step in the agent's execution with status, reasoning, and actions.
 */

import { useState } from 'react';
import type { AgentStep as AgentStepType } from '../../hooks/useAgentLoop';
import { CopyLink } from '../ui/CopyButton';

interface AgentStepProps {
  step: AgentStepType;
  isWaitingApproval?: boolean;
  onApprove?: () => void;
  onReject?: (reason?: string) => void;
}

const statusIcons: Record<AgentStepType['status'], { icon: string; color: string; bg: string }> = {
  pending: { icon: '○', color: 'text-slate-400 dark:text-zinc-400', bg: 'bg-slate-200 dark:bg-zinc-700' },
  running: { icon: '◌', color: 'text-yellow-500 dark:text-yellow-400', bg: 'bg-yellow-500/20' },
  done: { icon: '✓', color: 'text-green-500 dark:text-green-400', bg: 'bg-green-500/20' },
  failed: { icon: '✗', color: 'text-red-500 dark:text-red-400', bg: 'bg-red-500/20' },
  skipped: { icon: '–', color: 'text-slate-500 dark:text-zinc-500', bg: 'bg-slate-200 dark:bg-zinc-700' },
};

const actionLabels: Record<string, { label: string; icon: string }> = {
  create_flow: { label: 'Create Flow', icon: '➕' },
  modify_flow: { label: 'Modify Flow', icon: '✏️' },
  run_flow: { label: 'Run Flow', icon: '▶️' },
  start_service: { label: 'Start Service', icon: '🔌' },
  stop_service: { label: 'Stop Service', icon: '⏹️' },
  complete: { label: 'Complete', icon: '🎉' },
  error: { label: 'Error', icon: '❌' },
};

export default function AgentStep({
  step,
  isWaitingApproval,
  onApprove,
  onReject,
}: AgentStepProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const statusStyle = statusIcons[step.status] || statusIcons.pending;
  const actionInfo = actionLabels[step.action] || { label: step.action, icon: '•' };

  const handleReject = () => {
    if (showRejectInput && rejectReason.trim()) {
      onReject?.(rejectReason.trim());
      setShowRejectInput(false);
      setRejectReason('');
    } else if (!showRejectInput) {
      setShowRejectInput(true);
    } else {
      onReject?.();
      setShowRejectInput(false);
    }
  };

  return (
    <div className={`rounded-lg border ${statusStyle.bg} border-slate-200 dark:border-zinc-700 overflow-hidden`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Status indicator */}
        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${statusStyle.bg}`}>
          {step.status === 'running' ? (
            <div className="w-4 h-4 border-2 border-yellow-500 dark:border-yellow-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className={`text-sm ${statusStyle.color}`}>{statusStyle.icon}</span>
          )}
        </div>

        {/* Step info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-zinc-500">Step {step.stepNumber}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300">
              {actionInfo.icon} {actionInfo.label}
            </span>
          </div>
          <p className="text-sm text-slate-700 dark:text-zinc-200 truncate mt-0.5">
            {step.description || step.reasoning.slice(0, 60)}
          </p>
        </div>

        {/* Expand/collapse */}
        <svg
          className={`w-4 h-4 text-slate-400 dark:text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-zinc-700 p-3 space-y-3">
          {/* Reasoning */}
          {step.reasoning && (
            <div>
              <h4 className="text-xs text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-1">Reasoning</h4>
              <p className="text-sm text-slate-600 dark:text-zinc-300 whitespace-pre-wrap">{step.reasoning}</p>
            </div>
          )}

          {/* Payload */}
          {step.payload && Object.keys(step.payload).length > 0 && (
            <div>
              <h4 className="text-xs text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-1">Action Details</h4>
              <pre className="text-xs bg-slate-100 dark:bg-zinc-900 rounded p-2 overflow-x-auto text-slate-600 dark:text-zinc-400">
                {JSON.stringify(step.payload, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {step.result !== undefined && step.result !== null && (
            <div>
              <h4 className="text-xs text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-1">Result</h4>
              <pre className="text-xs bg-slate-100 dark:bg-zinc-900 rounded p-2 overflow-x-auto text-green-600 dark:text-green-400">
                {JSON.stringify(step.result, null, 2).slice(0, 500)}
              </pre>
            </div>
          )}

          {/* Error */}
          {step.error && (
            <div>
              <h4 className="text-xs text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-2">
                Error
                <CopyLink text={step.error} label="Copy" />
              </h4>
              <p className="text-sm text-red-600 dark:text-red-400">{step.error}</p>
            </div>
          )}

          {/* Timestamp */}
          <p className="text-xs text-slate-500 dark:text-zinc-600">
            {step.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      )}

      {/* Approval buttons */}
      {isWaitingApproval && step.status === 'pending' && (
        <div className="border-t border-slate-200 dark:border-zinc-700 p-3 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-600 dark:text-amber-400 text-sm">Waiting for approval</span>
          </div>

          {showRejectInput && (
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 rounded px-3 py-1.5 text-sm text-slate-800 dark:text-zinc-200 mb-2 focus:outline-none focus:border-amber-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReject();
                if (e.key === 'Escape') setShowRejectInput(false);
              }}
            />
          )}

          <div className="flex gap-2">
            <button
              onClick={onApprove}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approve
            </button>
            <button
              onClick={handleReject}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {showRejectInput ? 'Confirm Reject' : 'Reject'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

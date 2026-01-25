import { memo, useEffect, useRef, useCallback, useMemo } from 'react';
import type { LogEntry } from 'zipp-core';
import { CopyButton } from '../ui/CopyButton';

interface LogConsoleProps {
  logs: LogEntry[];
  onClear?: () => void;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const typeStyles: Record<string, { badge: string; text: string }> = {
  info: { badge: 'bg-blue-900 text-blue-200', text: 'text-slate-300' },
  error: { badge: 'bg-red-900 text-red-200', text: 'text-red-300' },
  success: { badge: 'bg-green-900 text-green-200', text: 'text-green-300' },
  node: { badge: 'bg-purple-900 text-purple-200', text: 'text-slate-300' },
  output: { badge: 'bg-emerald-900 text-emerald-200', text: 'text-emerald-300' },
};

// Memoized log entry component for better performance with large log lists
interface LogEntryRowProps {
  log: LogEntry;
  formatTime: (timestamp: number) => string;
}

const LogEntryRow = memo(function LogEntryRow({ log, formatTime }: LogEntryRowProps) {
  const style = typeStyles[log.type || 'info'];
  const isNode = log.source !== 'System';

  return (
    <div className="flex gap-1.5 sm:gap-2 items-start">
      {/* Timestamp - hidden on very small screens */}
      <span className="text-slate-600 shrink-0 w-14 sm:w-16 hidden xs:inline">
        {formatTime(log.timestamp)}
      </span>

      {/* Source Badge */}
      <span
        className={`badge shrink-0 ${log.source === 'Output'
          ? 'badge-green'
          : isNode
            ? 'bg-purple-500/20 text-purple-300'
            : 'badge-blue'
          }`}
      >
        {log.source === 'Output' ? 'OUT' : isNode ? 'NODE' : 'SYS'}
      </span>

      {/* Message */}
      <span className={`${log.source === 'Output' ? 'text-emerald-300' : style.text} whitespace-pre-wrap break-all text-[11px] sm:text-xs`}>
        {log.message}
        {/* Blinking cursor for streaming */}
        {log.isStreaming && (
          <span className="inline-block w-1.5 h-3 bg-green-500 ml-0.5 align-middle animate-blink" />
        )}
      </span>
    </div>
  );
});

function LogConsole({ logs, onClear, isOpen, onClose, className = '' }: LogConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  // Format all logs as text for copying
  const logsAsText = useMemo(() => {
    return logs.map(log => {
      const time = formatTime(log.timestamp);
      const source = log.source === 'Output' ? 'OUT' : log.source === 'System' ? 'SYS' : 'NODE';
      return `[${time}] [${source}] ${log.message}`;
    }).join('\n');
  }, [logs, formatTime]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Log panel */}
      <div
        className={`
          fixed md:relative z-50 md:z-auto right-0 top-0
          h-full bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col
          transition-transform duration-300 ease-in-out
          w-72 sm:w-80 md:w-72 lg:w-80
          ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
          ${className}
        `}
      >
        {/* Header */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-slate-700 dark:text-slate-200 font-semibold text-sm">Execution Log</h2>
              <p className="text-slate-400 dark:text-slate-500 text-xs">{logs.length} entries</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {logs.length > 0 && (
              <CopyButton text={logsAsText} label="Copy" size="sm" />
            )}
            {onClear && (
              <button
                onClick={onClear}
                className="btn btn-ghost btn-sm"
              >
                Clear
              </button>
            )}
            {/* Hide/collapse button */}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
              title="Hide execution log"
            >
              <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Log Entries */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2 font-mono text-xs"
        >
          {logs.length === 0 ? (
            <div className="empty-state py-12">
              <svg className="empty-state-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              <p className="empty-state-title">No logs yet</p>
              <p className="empty-state-description">Run a workflow to see output</p>
            </div>
          ) : (
            logs.map((log) => (
              <LogEntryRow key={log.id} log={log} formatTime={formatTime} />
            ))
          )}
        </div>

        {/* Status Bar */}
        <div className="p-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-600">
          <span>FormLogic VM</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Ready
          </span>
        </div>
      </div>
    </>
  );
}

export default memo(LogConsole);

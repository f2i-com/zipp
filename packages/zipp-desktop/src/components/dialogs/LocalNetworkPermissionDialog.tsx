import { useState } from 'react';
import type { LocalNetworkPermissionRequest } from 'zipp-core';

interface LocalNetworkPermissionDialogProps {
  request: LocalNetworkPermissionRequest;
  onResponse: (allowed: boolean, remember: boolean) => void;
}

export default function LocalNetworkPermissionDialog({
  request,
  onResponse,
}: LocalNetworkPermissionDialogProps) {
  const [remember, setRemember] = useState(true);

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 bg-amber-900/30 border-b border-amber-600/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-600/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-400">Local Network Access Request</h2>
              <p className="text-slate-400 text-sm">A workflow wants to connect to a local service</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Address being accessed */}
          <div className="bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <label className="text-slate-500 text-xs uppercase tracking-wider">Address</label>
            <div className="mt-1 font-mono text-lg text-slate-800 dark:text-slate-200">{request.hostPort}</div>
            <div className="mt-1 text-xs text-slate-500 truncate">{request.url}</div>
          </div>

          {/* Purpose if provided */}
          {request.purpose && (
            <div className="bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <label className="text-slate-500 text-xs uppercase tracking-wider">Purpose</label>
              <div className="mt-1 text-slate-700 dark:text-slate-300">{request.purpose}</div>
            </div>
          )}

          {/* Warning */}
          <div className="flex items-start gap-3 text-sm">
            <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-400">
              Only allow access if you trust this workflow and the service running at this address.
            </p>
          </div>

          {/* Remember checkbox */}
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-100 dark:bg-slate-700/30 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-green-500 focus:ring-green-500 focus:ring-offset-white dark:focus:ring-offset-slate-800"
            />
            <div>
              <span className="text-slate-800 dark:text-slate-200">Remember this address</span>
              <p className="text-slate-500 text-xs">Add to whitelist for future workflows</p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            onClick={() => onResponse(false, false)}
            className="flex-1 px-4 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors font-medium"
          >
            Deny
          </button>
          <button
            onClick={() => onResponse(true, remember)}
            className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium"
          >
            Allow {remember && '& Remember'}
          </button>
        </div>
      </div>
    </div>
  );
}

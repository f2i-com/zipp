/**
 * API Server Tab Component
 *
 * Manages the HTTP API server configuration for external integrations.
 * Extracted from SettingsPanel.tsx for maintainability.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('ApiServer');

interface ApiServerTabProps {
  isOpen: boolean;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ApiServerTab({ isOpen, onShowToast }: ApiServerTabProps) {
  const [apiEnabled, setApiEnabled] = useState(false);
  const [apiPort, setApiPort] = useState(3000);
  const [apiHost, setApiHost] = useState('127.0.0.1');
  const [apiRunning, setApiRunning] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);

  const loadApiConfig = useCallback(async () => {
    try {
      const config = await invoke<{ enabled: boolean; port: number; host: string }>('get_api_config');
      setApiEnabled(config.enabled);
      setApiPort(config.port);
      setApiHost(config.host);

      const status = await invoke<{ running: boolean }>('get_api_status');
      setApiRunning(status.running);
    } catch (e) {
      logger.error('Failed to load API config', { error: e });
    }
  }, []);

  // Load API server configuration when panel opens
  useEffect(() => {
    if (isOpen) {
      loadApiConfig();
    }
  }, [isOpen, loadApiConfig]);

  const handleApiConfigChange = useCallback(async (enabled: boolean, port: number, host: string) => {
    setApiLoading(true);
    try {
      await invoke('set_api_config', {
        config: { enabled, port, host }
      });
      setApiEnabled(enabled);
      setApiPort(port);
      setApiHost(host);

      // Reload status after change
      const status = await invoke<{ running: boolean }>('get_api_status');
      setApiRunning(status.running);

      if (enabled) {
        onShowToast?.(`API Server ${status.running ? 'started' : 'starting'} on http://${host}:${port}`, 'success');
      } else {
        onShowToast?.('API Server stopped', 'info');
      }
    } catch (e) {
      logger.error('Failed to update API config', { error: e });
      onShowToast?.(`Failed to update API config: ${e}`, 'error');
    } finally {
      setApiLoading(false);
    }
  }, [onShowToast]);

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          The HTTP API server allows external applications to interact with Zipp. This is used by the MCP server
          to enable Claude (via Claude Code or Claude Desktop) to create, run, and debug workflows conversationally.
          The API runs on localhost only and is not accessible from the network.
        </p>
      </div>

      {/* Enable/Disable Toggle */}
      <div className={`rounded-lg p-4 border ${apiRunning ? 'bg-green-100/50 dark:bg-green-900/20 border-green-500/30 dark:border-green-600/30' : 'bg-slate-100/50 dark:bg-slate-700/30 border-slate-300 dark:border-slate-600'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={apiEnabled}
            disabled={apiLoading}
            onChange={(e) => handleApiConfigChange(e.target.checked, apiPort, apiHost)}
            className="mt-1 w-5 h-5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-green-500 focus:ring-green-500 focus:ring-offset-white dark:focus:ring-offset-slate-800"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${apiRunning ? 'text-green-600 dark:text-green-400' : 'text-slate-700 dark:text-slate-200'}`}>
                {apiLoading ? 'Updating...' : apiRunning ? 'API Server Running' : 'Enable API Server'}
              </span>
              {apiRunning && (
                <span className="px-2 py-0.5 bg-green-600/30 text-green-600 dark:text-green-400 text-xs rounded-full">
                  Active
                </span>
              )}
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              {apiRunning
                ? `Listening at http://${apiHost === '0.0.0.0' ? 'localhost' : apiHost}:${apiPort}`
                : 'Start the HTTP API server to accept external requests'}
            </p>
          </div>
        </label>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Server Configuration
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Host</label>
            <select
              value={apiHost}
              onChange={(e) => {
                setApiHost(e.target.value);
                if (apiEnabled) {
                  handleApiConfigChange(true, apiPort, e.target.value);
                }
              }}
              disabled={apiLoading}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="127.0.0.1">127.0.0.1 (localhost only)</option>
              <option value="0.0.0.0">0.0.0.0 (all interfaces)</option>
            </select>
            <p className="text-slate-500 text-xs mt-1">
              {apiHost === '0.0.0.0'
                ? 'Accessible from other devices on your network'
                : 'Only accessible from this computer'}
            </p>
          </div>

          <div>
            <label className="text-slate-500 dark:text-slate-400 text-xs block mb-1">Port</label>
            <input
              type="number"
              value={apiPort}
              onChange={(e) => setApiPort(Number(e.target.value))}
              onBlur={() => {
                if (apiEnabled) {
                  handleApiConfigChange(true, apiPort, apiHost);
                }
              }}
              disabled={apiLoading}
              min={1024}
              max={65535}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <p className="text-slate-500 text-xs mt-1">Default: 3000</p>
          </div>
        </div>
      </div>

      {/* API Endpoints Reference */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          API Endpoints
        </h3>

        <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-200 dark:bg-slate-800">
              <tr className="border-b border-slate-300 dark:border-slate-700">
                <th className="text-left px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Method</th>
                <th className="text-left px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Endpoint</th>
                <th className="text-left px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-slate-600 dark:text-slate-400">
              {/* Health */}
              <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/30">
                <td colSpan={3} className="px-3 py-1 text-xs text-slate-500 font-medium">Health</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/health</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Health check</td>
              </tr>
              {/* Jobs */}
              <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/30">
                <td colSpan={3} className="px-3 py-1 text-xs text-slate-500 font-medium">Jobs</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-green-400 text-xs">POST</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/jobs</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Submit a new job</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/jobs</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">List all jobs</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-green-400 text-xs">POST</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/jobs/continue</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Continue paused job</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/jobs/:id</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Get job status</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-red-400 text-xs">DELETE</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/jobs/:id</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Abort a job</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/jobs/:id/logs</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Get job logs</td>
              </tr>
              {/* Flows */}
              <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/30">
                <td colSpan={3} className="px-3 py-1 text-xs text-slate-500 font-medium">Flows</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/flows</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">List all flows</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-green-400 text-xs">POST</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/flows</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Create a new flow</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/flows/:id</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Get flow details</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-yellow-400 text-xs">PATCH</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/flows/:id</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Update flow</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-red-400 text-xs">DELETE</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/flows/:id</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Delete flow</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-purple-400 text-xs">PUT</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/flows/:id/graph</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Replace flow graph</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-green-400 text-xs">POST</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/flows/:id/validate</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Validate flow</td>
              </tr>
              {/* Nodes & Modules */}
              <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/30">
                <td colSpan={3} className="px-3 py-1 text-xs text-slate-500 font-medium">Nodes & Modules</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/nodes</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">List available nodes</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/nodes/:type</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Get node definition</td>
              </tr>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/modules</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">List loaded modules</td>
              </tr>
              {/* Files */}
              <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/30">
                <td colSpan={3} className="px-3 py-1 text-xs text-slate-500 font-medium">Files</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5"><code className="text-blue-400 text-xs">GET</code></td>
                <td className="px-3 py-1.5 font-mono text-xs">/api/files/:name</td>
                <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs">Download output file</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Example Usage */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          Example Usage
        </h3>

        <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 font-mono text-xs">
          <div className="text-slate-500 mb-2"># Submit a job</div>
          <div className="text-slate-400 mb-4">
            curl -X POST http://{apiHost === '0.0.0.0' ? 'localhost' : apiHost}:{apiPort}/api/jobs \<br />
            &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
            &nbsp;&nbsp;-d '{`{"flow_id": "your-flow-id"}`}'
          </div>

          <div className="text-slate-500 mb-2"># Check job status</div>
          <div className="text-slate-400 mb-4">
            curl http://{apiHost === '0.0.0.0' ? 'localhost' : apiHost}:{apiPort}/api/jobs/JOB_ID
          </div>

          <div className="text-slate-500 mb-2"># List available flows</div>
          <div className="text-slate-400">
            curl http://{apiHost === '0.0.0.0' ? 'localhost' : apiHost}:{apiPort}/api/flows
          </div>
        </div>

        {apiRunning && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`http://${apiHost === '0.0.0.0' ? 'localhost' : apiHost}:${apiPort}`);
                onShowToast?.('API URL copied to clipboard', 'success');
              }}
              className="btn btn-secondary btn-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy API URL
            </button>
            <a
              href={`http://${apiHost === '0.0.0.0' ? 'localhost' : apiHost}:${apiPort}/api/health`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Test Health Endpoint
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

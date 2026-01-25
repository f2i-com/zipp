import { memo, useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { Position } from '@xyflow/react';
import { useNodeResize, CollapsibleNodeWrapper, type HandleConfig } from 'zipp-ui-components';


interface BrowserSessionNodeData {
  browserProfile?: string;
  sessionMode?: 'http' | 'webview' | 'playwright';
  playwrightUrl?: string;
  customUserAgent?: string;
  customHeaders?: string;
  initialCookies?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  _status?: 'running' | 'completed' | 'error';
  _collapsed?: boolean;
  onBrowserProfileChange?: (value: string) => void;
  onSessionModeChange?: (value: string) => void;
  onPlaywrightUrlChange?: (value: string) => void;
  onCustomUserAgentChange?: (value: string) => void;
  onCustomHeadersChange?: (value: string) => void;
  onInitialCookiesChange?: (value: string) => void;
  onViewportWidthChange?: (value: number) => void;
  onViewportHeightChange?: (value: number) => void;
  onCollapsedChange?: (value: boolean) => void;
  showBodyProperties?: boolean;
}

interface BrowserSessionNodeProps {
  data: BrowserSessionNodeData;
}

const BROWSER_PROFILES = [
  { value: 'chrome_windows', label: 'Chrome (Windows)', icon: 'C' },
  { value: 'chrome_mac', label: 'Chrome (macOS)', icon: 'C' },
  { value: 'firefox_windows', label: 'Firefox (Windows)', icon: 'F' },
  { value: 'firefox_mac', label: 'Firefox (macOS)', icon: 'F' },
  { value: 'safari_mac', label: 'Safari (macOS)', icon: 'S' },
  { value: 'edge_windows', label: 'Edge (Windows)', icon: 'E' },
  { value: 'mobile_ios', label: 'Safari (iOS)', icon: 'M' },
  { value: 'mobile_android', label: 'Chrome (Android)', icon: 'M' },
  { value: 'custom', label: 'Custom', icon: '?' },
] as const;

const BrowserSessionIcon = (
  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

function BrowserSessionNode({ data }: BrowserSessionNodeProps) {
  const [profile, setProfile] = useState(data.browserProfile || 'chrome_windows');
  const [sessionMode, setSessionMode] = useState(data.sessionMode || 'webview');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { size, handleResizeStart } = useNodeResize({
    initialWidth: 320,
    initialHeight: 220,
    constraints: { minWidth: 280, maxWidth: 500, minHeight: 180, maxHeight: 550 },
  });

  const onBrowserProfileChangeRef = useRef(data.onBrowserProfileChange);
  const onSessionModeChangeRef = useRef(data.onSessionModeChange);
  const onPlaywrightUrlChangeRef = useRef(data.onPlaywrightUrlChange);
  const onCustomUserAgentChangeRef = useRef(data.onCustomUserAgentChange);
  const onCustomHeadersChangeRef = useRef(data.onCustomHeadersChange);
  const onInitialCookiesChangeRef = useRef(data.onInitialCookiesChange);
  const onViewportWidthChangeRef = useRef(data.onViewportWidthChange);
  const onViewportHeightChangeRef = useRef(data.onViewportHeightChange);
  const onCollapsedChangeRef = useRef(data.onCollapsedChange);

  useEffect(() => {
    onBrowserProfileChangeRef.current = data.onBrowserProfileChange;
    onSessionModeChangeRef.current = data.onSessionModeChange;
    onPlaywrightUrlChangeRef.current = data.onPlaywrightUrlChange;
    onCustomUserAgentChangeRef.current = data.onCustomUserAgentChange;
    onCustomHeadersChangeRef.current = data.onCustomHeadersChange;
    onInitialCookiesChangeRef.current = data.onInitialCookiesChange;
    onViewportWidthChangeRef.current = data.onViewportWidthChange;
    onViewportHeightChangeRef.current = data.onViewportHeightChange;
    onCollapsedChangeRef.current = data.onCollapsedChange;
  });

  const handleProfileChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const newProfile = e.target.value;
    setProfile(newProfile);
    onBrowserProfileChangeRef.current?.(newProfile);
  }, []);

  const handleSessionModeChange = useCallback((mode: 'http' | 'webview' | 'playwright') => {
    setSessionMode(mode);
    onSessionModeChangeRef.current?.(mode);
  }, []);

  const handlePlaywrightUrlChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onPlaywrightUrlChangeRef.current?.(e.target.value);
  }, []);

  const handleCustomUserAgentChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onCustomUserAgentChangeRef.current?.(e.target.value);
  }, []);

  const handleCustomHeadersChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    onCustomHeadersChangeRef.current?.(e.target.value);
  }, []);

  const handleInitialCookiesChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    onInitialCookiesChangeRef.current?.(e.target.value);
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    onCollapsedChangeRef.current?.(collapsed);
  }, []);

  const selectedProfile = BROWSER_PROFILES.find(p => p.value === profile) || BROWSER_PROFILES[0];

  const collapsedPreview = (
    <div className="text-slate-400">
      <span className={
        sessionMode === 'webview' ? 'text-purple-400' :
        sessionMode === 'playwright' ? 'text-green-400' : 'text-cyan-400'
      }>
        {sessionMode === 'webview' ? 'WebView' : sessionMode === 'playwright' ? 'Playwright' : 'HTTP'}
      </span>
      <span className="ml-1 text-[10px]">{selectedProfile.icon}</span>
    </div>
  );

  const inputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'cookies', type: 'target', position: Position.Left, color: '!bg-yellow-500', label: 'cookies', labelColor: 'text-yellow-400', size: 'md' },
    { id: 'headers', type: 'target', position: Position.Left, color: '!bg-orange-400', label: 'headers', labelColor: 'text-orange-400', size: 'md' },
  ], []);

  const outputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'session', type: 'source', position: Position.Right, color: '!bg-green-500', size: 'lg' },
  ], []);

  const resizeHandles = (
    <>
      <div
        className="nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all"
        onMouseDown={(e) => handleResizeStart(e, 'e')}
      />
      <div
        className="nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all"
        onMouseDown={(e) => handleResizeStart(e, 's')}
      />
      <div
        className="nodrag absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
      >
        <svg className="w-3 h-3 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22Z" />
        </svg>
      </div>
    </>
  );

  return (
    <CollapsibleNodeWrapper
      title="Browser Session"
      color="cyan"
      icon={BrowserSessionIcon}
      width={size.width}
      collapsedWidth={140}
      status={data._status}
      isCollapsed={data._collapsed}
      onCollapsedChange={handleCollapsedChange}
      collapsedPreview={collapsedPreview}
      inputHandles={inputHandles}
      outputHandles={outputHandles}
      resizeHandles={resizeHandles}
    >
      {data.showBodyProperties !== false && (
        <>
          {/* Session Mode Toggle */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Browser Mode</label>
            <div className="flex gap-1">
              <button
                onClick={() => handleSessionModeChange('webview')}
                className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${sessionMode === 'webview'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600'
                  }`}
              >
                WebView
              </button>
              <button
                onClick={() => handleSessionModeChange('playwright')}
                className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${sessionMode === 'playwright'
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600'
                  }`}
              >
                Playwright
              </button>
            </div>
            <p className="text-slate-500 text-[9px] mt-1">
              {sessionMode === 'webview'
                ? 'Uses embedded browser panel'
                : 'Uses Playwright service (requires service running)'}
            </p>
          </div>

          {/* Playwright URL (only shown for playwright mode) */}
          {sessionMode === 'playwright' && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Playwright Service URL</label>
              <input
                type="text"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-green-500 font-mono"
                placeholder="http://127.0.0.1:8769"
                value={data.playwrightUrl || 'http://127.0.0.1:8769'}
                onChange={handlePlaywrightUrlChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Browser Profile */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Browser Profile</label>
            <div className="flex gap-2 items-center">
              <div className={`w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-sm ${sessionMode === 'webview' ? 'text-purple-400' : 'text-cyan-400'
                }`}>
                {selectedProfile.icon}
              </div>
              <select
                className="nodrag nowheel flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                value={profile}
                onChange={handleProfileChange}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {BROWSER_PROFILES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Viewport Size (WebView and Playwright) */}
          {(sessionMode === 'webview' || sessionMode === 'playwright') && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Viewport Size</label>
              <div className="flex gap-1 items-center">
                <input
                  type="number"
                  className="nodrag nowheel flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="1280"
                  value={data.viewportWidth || 1280}
                  onChange={(e) => onViewportWidthChangeRef.current?.(parseInt(e.target.value) || 1280)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <span className="text-slate-500 text-xs shrink-0">×</span>
                <input
                  type="number"
                  className="nodrag nowheel flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="800"
                  value={data.viewportHeight || 800}
                  onChange={(e) => onViewportHeightChangeRef.current?.(parseInt(e.target.value) || 800)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* Custom User-Agent (only shown for custom profile) */}
          {profile === 'custom' && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Custom User-Agent</label>
              <input
                type="text"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                placeholder="Mozilla/5.0 ..."
                value={data.customUserAgent || ''}
                onChange={handleCustomUserAgentChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Advanced Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 transition-colors"
          >
            <span>Advanced Settings</span>
            <svg
              className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Advanced Settings */}
          {showAdvanced && (
            <>
              <div>
                <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
                  Custom Headers <span className="text-slate-600">(JSON)</span>
                </label>
                <textarea
                  className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono"
                  rows={2}
                  placeholder='{"X-Custom": "value"}'
                  value={data.customHeaders || ''}
                  onChange={handleCustomHeadersChange}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>

              <div>
                <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
                  Initial Cookies <span className="text-slate-600">(from DevTools)</span>
                </label>
                <textarea
                  className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono"
                  rows={2}
                  placeholder="Paste cookies JSON or cookie header string"
                  value={data.initialCookies || ''}
                  onChange={handleInitialCookiesChange}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            </>
          )}

          <p className="text-slate-500 text-[10px]">
            {sessionMode === 'webview'
              ? 'Creates a WebView browser with full JavaScript support'
              : sessionMode === 'playwright'
              ? 'Uses Playwright Chromium via external service'
              : 'Creates HTTP session with User-Agent and cookies'}
          </p>
        </>
      )}
    </CollapsibleNodeWrapper>
  );
}

export default memo(BrowserSessionNode);

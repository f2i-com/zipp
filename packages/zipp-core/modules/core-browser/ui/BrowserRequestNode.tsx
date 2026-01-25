import { memo, useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { Position } from '@xyflow/react';
import { useNodeResize, CollapsibleNodeWrapper, type HandleConfig } from 'zipp-ui-components';


interface BrowserRequestNodeData {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url?: string;
  bodyType?: 'none' | 'form_urlencoded' | 'json' | 'multipart' | 'raw';
  body?: string;
  headers?: string;
  customHeaders?: string; // Legacy
  responseFormat?: 'html' | 'json' | 'text' | 'full';
  followRedirects?: boolean;
  maxRedirects?: number;
  waitForSelector?: string;
  waitTimeout?: number;
  _status?: 'running' | 'completed' | 'error';
  _collapsed?: boolean;
  onMethodChange?: (value: string) => void;
  onUrlChange?: (value: string) => void;
  onBodyTypeChange?: (value: string) => void;
  onBodyChange?: (value: string) => void;
  onHeadersChange?: (value: string) => void;
  onCustomHeadersChange?: (value: string) => void;
  onResponseFormatChange?: (value: string) => void;
  onFollowRedirectsChange?: (value: boolean) => void;
  onMaxRedirectsChange?: (value: number) => void;
  onWaitForSelectorChange?: (value: string) => void;
  onWaitTimeoutChange?: (value: number) => void;
  onCollapsedChange?: (value: boolean) => void;
  showBodyProperties?: boolean;
}

interface BrowserRequestNodeProps {
  data: BrowserRequestNodeData;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
const BODY_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'form_urlencoded', label: 'Form (URL encoded)' },
  { value: 'json', label: 'JSON' },
  { value: 'raw', label: 'Raw' },
] as const;
const RESPONSE_FORMATS = [
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'full', label: 'Full (with headers)' },
] as const;

const BrowserRequestIcon = (
  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

function BrowserRequestNode({ data }: BrowserRequestNodeProps) {
  // Use data directly instead of local state to support external updates
  const method = data.method || 'GET';
  const bodyType = data.bodyType || 'none';
  const showBody = method !== 'GET' && bodyType !== 'none';
  const showBodyProperties = data.showBodyProperties !== false;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const { size, handleResizeStart } = useNodeResize({
    initialWidth: 340,
    initialHeight: 280,
    constraints: { minWidth: 300, maxWidth: 600, minHeight: 200, maxHeight: 600 },
  });

  const onMethodChangeRef = useRef(data.onMethodChange);
  const onUrlChangeRef = useRef(data.onUrlChange);
  const onBodyTypeChangeRef = useRef(data.onBodyTypeChange);
  const onBodyChangeRef = useRef(data.onBodyChange);
  const onHeadersChangeRef = useRef(data.onHeadersChange || data.onCustomHeadersChange);
  const onResponseFormatChangeRef = useRef(data.onResponseFormatChange);
  const onFollowRedirectsChangeRef = useRef(data.onFollowRedirectsChange);
  const onMaxRedirectsChangeRef = useRef(data.onMaxRedirectsChange);
  const onWaitForSelectorChangeRef = useRef(data.onWaitForSelectorChange);
  const onWaitTimeoutChangeRef = useRef(data.onWaitTimeoutChange);
  const onCollapsedChangeRef = useRef(data.onCollapsedChange);

  useEffect(() => {
    onMethodChangeRef.current = data.onMethodChange;
    onUrlChangeRef.current = data.onUrlChange;
    onBodyTypeChangeRef.current = data.onBodyTypeChange;
    onBodyChangeRef.current = data.onBodyChange;
    onHeadersChangeRef.current = data.onHeadersChange || data.onCustomHeadersChange;
    onResponseFormatChangeRef.current = data.onResponseFormatChange;
    onFollowRedirectsChangeRef.current = data.onFollowRedirectsChange;
    onMaxRedirectsChangeRef.current = data.onMaxRedirectsChange;
    onWaitForSelectorChangeRef.current = data.onWaitForSelectorChange;
    onWaitTimeoutChangeRef.current = data.onWaitTimeoutChange;
    onCollapsedChangeRef.current = data.onCollapsedChange;
  });

  const handleMethodChange = useCallback((newMethod: typeof METHODS[number]) => {
    onMethodChangeRef.current?.(newMethod);
  }, []);

  const handleUrlChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onUrlChangeRef.current?.(e.target.value);
  }, []);

  const handleBodyTypeChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as typeof BODY_TYPES[number]['value'];
    onBodyTypeChangeRef.current?.(newType);
  }, []);

  const handleBodyChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    onBodyChangeRef.current?.(e.target.value);
  }, []);

  const handleHeadersChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    onHeadersChangeRef.current?.(e.target.value);
  }, []);

  const handleResponseFormatChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    onResponseFormatChangeRef.current?.(e.target.value);
  }, []);

  const handleFollowRedirectsChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onFollowRedirectsChangeRef.current?.(e.target.checked);
  }, []);

  const handleMaxRedirectsChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onMaxRedirectsChangeRef.current?.(parseInt(e.target.value) || 5);
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    onCollapsedChangeRef.current?.(collapsed);
  }, []);

  // Safely convert url to string for display
  const displayUrl = data.url
    ? (typeof data.url === 'object' ? JSON.stringify(data.url) : String(data.url))
    : '';

  const collapsedPreview = (
    <div className="text-slate-400">
      <span className="text-cyan-400">{method}</span>
      {displayUrl && <span className="ml-1 text-[10px] truncate">{displayUrl.slice(0, 20)}...</span>}
    </div>
  );

  const inputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'session', type: 'target', position: Position.Left, color: '!bg-cyan-500', label: 'session', labelColor: 'text-cyan-400', size: 'lg' },
    { id: 'url', type: 'target', position: Position.Left, color: '!bg-blue-500', label: 'url', labelColor: 'text-blue-400', size: 'md' },
    { id: 'body', type: 'target', position: Position.Left, color: '!bg-yellow-500', label: 'body', labelColor: 'text-yellow-400', size: 'md' },
  ], []);

  const outputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'response', type: 'source', position: Position.Right, color: '!bg-green-500', size: 'lg' },
    { id: 'session', type: 'source', position: Position.Right, color: '!bg-cyan-500', label: 'session', labelColor: 'text-cyan-400', size: 'md' },
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
      title="Browser Request"
      color="cyan"
      icon={BrowserRequestIcon}
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
      {showBodyProperties && (
        <>
          {/* Method Selector */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Method</label>
            <div className="flex gap-1 flex-wrap">
              {METHODS.map((m) => (
                <button
                  key={m}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${method === m
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-600'
                    }`}
                  onClick={() => handleMethodChange(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* URL Input */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">URL</label>
            <input
              type="text"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
              placeholder="https://example.com/page"
              value={data.url || ''}
              onChange={handleUrlChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Body Type (for POST/PUT/DELETE) */}
          {method !== 'GET' && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Body Type</label>
              <select
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                value={bodyType}
                onChange={handleBodyTypeChange}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {BODY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Body */}
          {showBody && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Body</label>
              <textarea
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono"
                rows={3}
                placeholder={bodyType === 'json' ? '{"key": "value"}' : 'key=value&key2=value2'}
                value={data.body || ''}
                onChange={handleBodyChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </>
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
      {showAdvanced && showBodyProperties && (
        <>
          {/* Custom Headers */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              Custom Headers <span className="text-cyan-400">(JSON)</span>
            </label>
            <textarea
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono"
              rows={3}
              placeholder={'{\n  "Origin": "https://example.com",\n  "Referer": "https://example.com/page"\n}'}
              value={data.headers || data.customHeaders || ''}
              onChange={handleHeadersChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <p className="text-slate-500 text-[9px] mt-1">
              Set any headers including Origin, Referer, etc.
            </p>
          </div>

          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Response Format</label>
            <select
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
              value={data.responseFormat || 'html'}
              onChange={handleResponseFormatChange}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {RESPONSE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs">
              <input
                type="checkbox"
                className="nodrag"
                checked={data.followRedirects !== false}
                onChange={handleFollowRedirectsChange}
              />
              Follow Redirects
            </label>

            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs">
              Max:
              <input
                type="number"
                className="nodrag nowheel w-12 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-xs text-slate-200"
                value={data.maxRedirects || 5}
                min={1}
                max={20}
                onChange={handleMaxRedirectsChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </label>
          </div>

          {/* Wait for Selector (WebView mode) */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              Wait for Selector <span className="text-purple-400">(WebView)</span>
            </label>
            <input
              type="text"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
              placeholder="#content, .loaded, [data-ready]"
              value={data.waitForSelector || ''}
              onChange={(e) => onWaitForSelectorChangeRef.current?.(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <p className="text-slate-500 text-[9px] mt-1">
              Wait for this CSS selector before returning (WebView sessions only)
            </p>
          </div>
        </>
      )}

      <p className="text-slate-500 text-[10px]">
        Outputs: <span className="text-green-400">body</span>, <span className="text-cyan-400">session</span> (with cookies)
      </p>
    </CollapsibleNodeWrapper>
  );
}

export default memo(BrowserRequestNode);

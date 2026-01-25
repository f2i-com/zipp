import { memo, useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { Position } from '@xyflow/react';
import { useNodeResize, CollapsibleNodeWrapper, type HandleConfig, type ValidationIssue } from 'zipp-ui-components';


interface BrowserControlNodeData {
  action?: 'click' | 'type' | 'scroll' | 'screenshot' | 'evaluate' | 'wait';
  selector?: string;
  value?: string;
  scrollDirection?: 'up' | 'down' | 'left' | 'right';
  scrollAmount?: number;
  waitTimeout?: number;
  _status?: 'running' | 'completed' | 'error';
  _collapsed?: boolean;
  onActionChange?: (value: string) => void;
  onSelectorChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  onScrollDirectionChange?: (value: string) => void;
  onScrollAmountChange?: (value: number) => void;
  onWaitTimeoutChange?: (value: number) => void;
  onCollapsedChange?: (value: boolean) => void;
  showBodyProperties?: boolean;
}

interface BrowserControlNodeProps {
  data: BrowserControlNodeData;
}

const ACTIONS = [
  { value: 'click', label: 'Click Element' },
  { value: 'type', label: 'Type Text' },
  { value: 'scroll', label: 'Scroll Page' },
  { value: 'screenshot', label: 'Take Screenshot' },
  { value: 'evaluate', label: 'Run JavaScript' },
  { value: 'wait', label: 'Wait for Element' },
] as const;

const SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

// Icon for the node header
const BrowserControlIcon = (
  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
  </svg>
);

function BrowserControlNode({ data }: BrowserControlNodeProps) {
  const [action, setAction] = useState(data.action || 'click');
  const { size, handleResizeStart } = useNodeResize({
    initialWidth: 280,
    initialHeight: 240,
    constraints: { minWidth: 240, maxWidth: 400, minHeight: 180, maxHeight: 450 },
  });

  const onActionChangeRef = useRef(data.onActionChange);
  const onSelectorChangeRef = useRef(data.onSelectorChange);
  const onValueChangeRef = useRef(data.onValueChange);
  const onScrollDirectionChangeRef = useRef(data.onScrollDirectionChange);
  const onScrollAmountChangeRef = useRef(data.onScrollAmountChange);
  const onWaitTimeoutChangeRef = useRef(data.onWaitTimeoutChange);
  const onCollapsedChangeRef = useRef(data.onCollapsedChange);

  useEffect(() => {
    onActionChangeRef.current = data.onActionChange;
    onSelectorChangeRef.current = data.onSelectorChange;
    onValueChangeRef.current = data.onValueChange;
    onScrollDirectionChangeRef.current = data.onScrollDirectionChange;
    onScrollAmountChangeRef.current = data.onScrollAmountChange;
    onWaitTimeoutChangeRef.current = data.onWaitTimeoutChange;
    onCollapsedChangeRef.current = data.onCollapsedChange;
  });

  const handleActionChange = useCallback((newAction: typeof ACTIONS[number]['value']) => {
    setAction(newAction);
    onActionChangeRef.current?.(newAction);
  }, []);

  const handleSelectorChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onSelectorChangeRef.current?.(e.target.value);
  }, []);

  const handleValueChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onValueChangeRef.current?.(e.target.value);
  }, []);

  const handleScrollDirectionChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    onScrollDirectionChangeRef.current?.(e.target.value);
  }, []);

  const handleScrollAmountChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onScrollAmountChangeRef.current?.(parseInt(e.target.value) || 300);
  }, []);

  const handleWaitTimeoutChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onWaitTimeoutChangeRef.current?.(parseInt(e.target.value) || 30000);
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    onCollapsedChangeRef.current?.(collapsed);
  }, []);

  // Determine what fields to show based on action
  const showSelector = ['click', 'type', 'wait'].includes(action);
  const showValue = ['type', 'evaluate'].includes(action);
  const showScrollOptions = action === 'scroll';

  // Compute validation issues
  const validationIssues = useMemo(() => {
    const issues: ValidationIssue[] = [];
    if (showSelector && !data.selector) {
      issues.push({ field: 'Selector', message: 'Required' });
    }
    if (action === 'type' && !data.value) {
      issues.push({ field: 'Value', message: 'Required' });
    }
    if (action === 'evaluate' && !data.value) {
      issues.push({ field: 'Code', message: 'Required' });
    }
    return issues;
  }, [action, data.selector, data.value, showSelector]);

  // Collapsed preview content
  const collapsedPreview = (
    <div className="text-slate-400">
      <span className="text-purple-400 font-medium">
        {ACTIONS.find(a => a.value === action)?.label || action}
      </span>
    </div>
  );

  // Input handles using HandleConfig
  const inputHandles = useMemo<HandleConfig[]>(() => {
    const handles: HandleConfig[] = [
      { id: 'session', type: 'target', position: Position.Left, color: '!bg-cyan-500', label: 'session', labelColor: 'text-cyan-400', size: 'lg' },
      { id: 'action', type: 'target', position: Position.Left, color: '!bg-purple-400', label: 'action', labelColor: 'text-purple-400', size: 'sm' },
    ];
    if (showSelector) {
      handles.push({ id: 'selector', type: 'target', position: Position.Left, color: '!bg-blue-400', label: 'selector', labelColor: 'text-blue-400', size: 'sm' });
    }
    if (showValue) {
      handles.push({ id: 'value', type: 'target', position: Position.Left, color: '!bg-green-400', label: 'value', labelColor: 'text-green-400', size: 'sm' });
    }
    return handles;
  }, [showSelector, showValue]);

  // Output handles using HandleConfig - IDs must match node definition in browser_control.json
  const outputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'result', type: 'source', position: Position.Right, color: '!bg-green-500', label: 'result', labelColor: 'text-green-400', size: 'lg' },
    { id: 'page', type: 'source', position: Position.Right, color: '!bg-orange-500', label: 'page', labelColor: 'text-orange-400', size: 'md' },
    { id: 'screenshot', type: 'source', position: Position.Right, color: '!bg-pink-500', label: 'screenshot', labelColor: 'text-pink-400', size: 'md' },
    { id: 'session', type: 'source', position: Position.Right, color: '!bg-cyan-500', label: 'session', labelColor: 'text-cyan-400', size: 'sm' },
  ], []);

  // Resize handles
  const resizeHandles = (
    <>
      <div
        className="nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-purple-500/30 transition-all"
        onMouseDown={(e) => handleResizeStart(e, 'e')}
      />
      <div
        className="nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-purple-500/30 transition-all"
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
      title="Browser Control"
      color="purple"
      icon={BrowserControlIcon}
      width={size.width}
      collapsedWidth={150}
      status={data._status}
      validationIssues={validationIssues}
      isCollapsed={data._collapsed}
      onCollapsedChange={handleCollapsedChange}
      collapsedPreview={collapsedPreview}
      inputHandles={inputHandles}
      outputHandles={outputHandles}
      resizeHandles={resizeHandles}
    >
      {data.showBodyProperties !== false && (
        <>
          {/* Action Selector */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Action</label>
            <select
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              value={action}
              onChange={(e) => handleActionChange(e.target.value as typeof ACTIONS[number]['value'])}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          {/* Action-specific inputs */}
          {/* Action-specific inputs */}
          {['click', 'type', 'wait', 'evaluate'].includes(action) && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
                {action === 'wait' ? 'Selector (Optional)' : 'Selector'}
              </label>
              <input
                type="text"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder={action === 'wait' ? '.target (if waiting for element)' : '#submit-btn'}
                value={data.selector || ''}
                onChange={handleSelectorChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {action === 'type' && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Value to Type</label>
              <input
                type="text"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder="Hello World"
                value={data.value || ''}
                onChange={handleValueChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {action === 'evaluate' && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">JavaScript Code</label>
              <textarea
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-purple-500 font-mono"
                rows={4}
                placeholder="return document.title;"
                value={data.value || ''}
                onChange={handleValueChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {showScrollOptions && (
            <>
              <div>
                <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Direction</label>
                <select
                  className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                  value={data.scrollDirection || 'down'}
                  onChange={handleScrollDirectionChange}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {SCROLL_DIRECTIONS.map((dir) => (
                    <option key={dir} value={dir}>{dir.charAt(0).toUpperCase() + dir.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Amount (px)</label>
                <input
                  type="number"
                  className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                  placeholder="300"
                  value={data.scrollAmount || 300}
                  onChange={handleScrollAmountChange}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            </>
          )}

          {action === 'wait' && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Timeout (ms)</label>
              <input
                type="number"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder="30000"
                value={data.waitTimeout || 30000}
                min={0}
                max={120000}
                onChange={handleWaitTimeoutChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Screenshot note */}
          {action === 'screenshot' && (
            <div className="bg-pink-900/20 border border-pink-500/30 rounded p-2">
              <p className="text-pink-300 text-xs">Captures page as base64 PNG</p>
            </div>
          )}
        </>
      )}
    </CollapsibleNodeWrapper >
  );
}

export default memo(BrowserControlNode);

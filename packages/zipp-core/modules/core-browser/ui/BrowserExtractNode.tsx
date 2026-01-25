import { memo, useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { Position } from '@xyflow/react';
import { useNodeResize, CollapsibleNodeWrapper, type HandleConfig } from 'zipp-ui-components';


interface BrowserExtractNodeData {
  extractionType?: 'css_selector' | 'regex' | 'all_links' | 'all_forms' | 'form_fields';
  selector?: string;
  pattern?: string;
  extractTarget?: 'text' | 'html' | 'attribute';
  attributeName?: string;
  outputFormat?: 'first' | 'all_json' | 'all_newline';
  maxLength?: number;
  _status?: 'running' | 'completed' | 'error';
  _collapsed?: boolean;
  onExtractionTypeChange?: (value: string) => void;
  onSelectorChange?: (value: string) => void;
  onPatternChange?: (value: string) => void;
  onExtractTargetChange?: (value: string) => void;
  onAttributeNameChange?: (value: string) => void;
  onOutputFormatChange?: (value: string) => void;
  onMaxLengthChange?: (value: number) => void;
  onCollapsedChange?: (value: boolean) => void;
  showBodyProperties?: boolean;
}

interface BrowserExtractNodeProps {
  data: BrowserExtractNodeData;
}

const EXTRACTION_TYPES = [
  { value: 'css_selector', label: 'CSS Selector' },
  { value: 'regex', label: 'Regex Pattern' },
  { value: 'all_links', label: 'All Links' },
  { value: 'all_forms', label: 'All Forms' },
  { value: 'form_fields', label: 'Form Fields' },
] as const;

const EXTRACT_TARGETS = [
  { value: 'text', label: 'Text Content' },
  { value: 'html', label: 'Inner HTML' },
  { value: 'attribute', label: 'Attribute' },
] as const;

const OUTPUT_FORMATS = [
  { value: 'first', label: 'First Match' },
  { value: 'all_json', label: 'All (JSON Array)' },
  { value: 'all_newline', label: 'All (Newline Sep.)' },
] as const;

const BrowserExtractIcon = (
  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

function BrowserExtractNode({ data }: BrowserExtractNodeProps) {
  const [extractionType, setExtractionType] = useState(data.extractionType || 'css_selector');
  const [extractTarget, setExtractTarget] = useState(data.extractTarget || 'text');
  const { size, handleResizeStart } = useNodeResize({
    initialWidth: 320,
    initialHeight: 260,
    constraints: { minWidth: 280, maxWidth: 500, minHeight: 200, maxHeight: 500 },
  });

  const onExtractionTypeChangeRef = useRef(data.onExtractionTypeChange);
  const onSelectorChangeRef = useRef(data.onSelectorChange);
  const onPatternChangeRef = useRef(data.onPatternChange);
  const onExtractTargetChangeRef = useRef(data.onExtractTargetChange);
  const onAttributeNameChangeRef = useRef(data.onAttributeNameChange);
  const onOutputFormatChangeRef = useRef(data.onOutputFormatChange);
  const onMaxLengthChangeRef = useRef(data.onMaxLengthChange);
  const onCollapsedChangeRef = useRef(data.onCollapsedChange);

  useEffect(() => {
    onExtractionTypeChangeRef.current = data.onExtractionTypeChange;
    onSelectorChangeRef.current = data.onSelectorChange;
    onPatternChangeRef.current = data.onPatternChange;
    onExtractTargetChangeRef.current = data.onExtractTargetChange;
    onAttributeNameChangeRef.current = data.onAttributeNameChange;
    onOutputFormatChangeRef.current = data.onOutputFormatChange;
    onMaxLengthChangeRef.current = data.onMaxLengthChange;
    onCollapsedChangeRef.current = data.onCollapsedChange;
  });

  const handleExtractionTypeChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as typeof EXTRACTION_TYPES[number]['value'];
    setExtractionType(newType);
    onExtractionTypeChangeRef.current?.(newType);
  }, []);

  const handleSelectorChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onSelectorChangeRef.current?.(e.target.value);
  }, []);

  const handlePatternChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onPatternChangeRef.current?.(e.target.value);
  }, []);

  const handleExtractTargetChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const newTarget = e.target.value as typeof EXTRACT_TARGETS[number]['value'];
    setExtractTarget(newTarget);
    onExtractTargetChangeRef.current?.(newTarget);
  }, []);

  const handleAttributeNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onAttributeNameChangeRef.current?.(e.target.value);
  }, []);

  const handleOutputFormatChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    onOutputFormatChangeRef.current?.(e.target.value);
  }, []);

  const handleMaxLengthChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    onMaxLengthChangeRef.current?.(value);
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    onCollapsedChangeRef.current?.(collapsed);
  }, []);

  const showSelector = (['css_selector', 'form_fields'] as string[]).includes(extractionType);
  const showPattern = extractionType === 'regex';
  const showExtractTarget = (['css_selector', 'all_links'] as string[]).includes(extractionType);
  const showOutputFormat = !(['all_links', 'all_forms', 'form_fields'] as string[]).includes(extractionType);

  const collapsedPreview = (
    <div className="text-slate-400">
      <span className="text-cyan-400">
        {EXTRACTION_TYPES.find(t => t.value === extractionType)?.label || extractionType}
      </span>
    </div>
  );

  const inputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'content', type: 'target', position: Position.Left, color: '!bg-blue-500', label: 'html', labelColor: 'text-blue-400', size: 'lg' },
  ], []);

  const outputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'result', type: 'source', position: Position.Right, color: '!bg-green-500', size: 'lg' },
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
      title="Extract Content"
      color="cyan"
      icon={BrowserExtractIcon}
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
          {/* Extraction Type */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Extraction Type</label>
            <select
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              value={extractionType}
              onChange={handleExtractionTypeChange}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {EXTRACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Selector / Pattern */}
          {showSelector && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">CSS Selector</label>
              <input
                type="text"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder=".product-title"
                value={data.selector || ''}
                onChange={handleSelectorChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {showPattern && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Regex Pattern</label>
              <input
                type="text"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder="Product ID: (\d+)"
                value={data.pattern || ''}
                onChange={handlePatternChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Extract Target (Attribute vs Text) */}
          {showExtractTarget && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Target</label>
              <div className="flex gap-2">
                <select
                  className="flex-1 nodrag nowheel bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                  value={extractTarget}
                  onChange={handleExtractTargetChange}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {EXTRACT_TARGETS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {extractTarget === 'attribute' && (
                  <input
                    type="text"
                    className="flex-1 nodrag nowheel bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    placeholder="href"
                    value={data.attributeName || ''}
                    onChange={handleAttributeNameChange}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </div>
          )}

          {/* Output Format */}
          {showOutputFormat && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Output Format</label>
              <select
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                value={data.outputFormat || 'first'}
                onChange={handleOutputFormatChange}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {OUTPUT_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Max Length (optional truncation for AI processing) */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Max Length (0 = unlimited)</label>
            <input
              type="number"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              placeholder="8000"
              value={data.maxLength || 0}
              min={0}
              max={100000}
              onChange={handleMaxLengthChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <p className="text-slate-600 text-[10px] mt-1">
              Truncates output for AI processing (recommended: 8000-16000)
            </p>
          </div>

          {/* Help text based on extraction type */}
          <p className="text-slate-500 text-[10px]">
            {extractionType === 'all_links' && 'Extracts all links as JSON array [{text, href}]'}
            {extractionType === 'all_forms' && 'Extracts all forms with fields as JSON'}
            {extractionType === 'form_fields' && 'Extracts input fields from selected form'}
            {extractionType === 'css_selector' && 'Extracts content matching CSS selector'}
            {extractionType === 'regex' && 'Extracts content matching regex pattern'}
          </p>
        </>
      )}
    </CollapsibleNodeWrapper>
  );
}

export default memo(BrowserExtractNode);

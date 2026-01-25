import { memo, useRef, useEffect, useCallback, useMemo } from 'react';
import { Position } from '@xyflow/react';
import { CollapsibleNodeWrapper, type HandleConfig } from 'zipp-ui-components';

interface VectorizeNodeData {
  outputPath?: string;
  colorCount?: number;
  quality?: 'fast' | 'balanced' | 'high' | 'detailed';
  smoothness?: number;
  minArea?: number;
  removeBackground?: boolean;
  optimize?: boolean;
  _status?: 'running' | 'completed' | 'error';
  _collapsed?: boolean;
  onOutputPathChange?: (value: string) => void;
  onColorCountChange?: (value: number) => void;
  onQualityChange?: (value: string) => void;
  onSmoothnessChange?: (value: number) => void;
  onMinAreaChange?: (value: number) => void;
  onRemoveBackgroundChange?: (value: boolean) => void;
  onOptimizeChange?: (value: boolean) => void;
  onCollapsedChange?: (value: boolean) => void;
  showBodyProperties?: boolean;
}

interface VectorizeNodeProps {
  data: VectorizeNodeData;
}

// Store callbacks in refs to avoid stale closures
function useCallbackRefs(data: VectorizeNodeData) {
  const refs = {
    onOutputPathChange: useRef(data.onOutputPathChange),
    onColorCountChange: useRef(data.onColorCountChange),
    onQualityChange: useRef(data.onQualityChange),
    onSmoothnessChange: useRef(data.onSmoothnessChange),
    onMinAreaChange: useRef(data.onMinAreaChange),
    onRemoveBackgroundChange: useRef(data.onRemoveBackgroundChange),
    onOptimizeChange: useRef(data.onOptimizeChange),
    onCollapsedChange: useRef(data.onCollapsedChange),
  };

  useEffect(() => {
    refs.onOutputPathChange.current = data.onOutputPathChange;
    refs.onColorCountChange.current = data.onColorCountChange;
    refs.onQualityChange.current = data.onQualityChange;
    refs.onSmoothnessChange.current = data.onSmoothnessChange;
    refs.onMinAreaChange.current = data.onMinAreaChange;
    refs.onRemoveBackgroundChange.current = data.onRemoveBackgroundChange;
    refs.onOptimizeChange.current = data.onOptimizeChange;
    refs.onCollapsedChange.current = data.onCollapsedChange;
  });

  return refs;
}

const VectorizeIcon = (
  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
  </svg>
);

function VectorizeNode({ data }: VectorizeNodeProps) {
  const callbackRefs = useCallbackRefs(data);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    callbackRefs.onCollapsedChange.current?.(collapsed);
  }, []);

  const handleOutputPathChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onOutputPathChange.current?.(e.target.value);
  }, []);

  const handleColorCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onColorCountChange.current?.(parseInt(e.target.value));
  }, []);

  const handleQualityChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    callbackRefs.onQualityChange.current?.(e.target.value);
  }, []);

  const handleSmoothnessChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onSmoothnessChange.current?.(parseFloat(e.target.value));
  }, []);

  const handleMinAreaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onMinAreaChange.current?.(parseInt(e.target.value));
  }, []);

  const handleRemoveBackgroundChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onRemoveBackgroundChange.current?.(e.target.checked);
  }, []);

  const handleOptimizeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onOptimizeChange.current?.(e.target.checked);
  }, []);

  const collapsedPreview = (
    <div className="text-slate-600 dark:text-slate-400 text-[10px]">
      <span className="text-purple-400">{data.colorCount || 16}</span>
      <span className="mx-1">colors</span>
      <span className="text-purple-400">{data.quality || 'balanced'}</span>
    </div>
  );

  const inputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'image', type: 'target', position: Position.Left, color: '!bg-blue-500', size: 'lg', label: 'image' },
  ], []);

  const outputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'svg', type: 'source', position: Position.Right, color: '!bg-purple-500', size: 'lg' },
  ], []);

  return (
    <CollapsibleNodeWrapper
      title="Vectorize"
      color="purple"
      icon={VectorizeIcon}
      width={280}
      collapsedWidth={150}
      status={data._status}
      isCollapsed={data._collapsed}
      onCollapsedChange={handleCollapsedChange}
      collapsedPreview={collapsedPreview}
      inputHandles={inputHandles}
      outputHandles={outputHandles}
    >
      {data.showBodyProperties !== false && (
        <>
          {/* Output Path */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Output Path</label>
            <input
              type="text"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              placeholder="Auto (Downloads folder)"
              value={data.outputPath || ''}
              onChange={handleOutputPathChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Color Count */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              Colors: <span className="text-purple-400">{data.colorCount || 16}</span>
            </label>
            <input
              type="range"
              className="nodrag nowheel w-full accent-purple-500"
              min="2"
              max="64"
              value={data.colorCount || 16}
              onChange={handleColorCountChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Quality */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Quality</label>
            <select
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              value={data.quality || 'balanced'}
              onChange={handleQualityChange}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="high">High Quality</option>
              <option value="detailed">Detailed (Text/Lines)</option>
            </select>
          </div>

          {/* Smoothness */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              Smoothness: <span className="text-purple-400">{(data.smoothness || 1.0).toFixed(1)}</span>
            </label>
            <input
              type="range"
              className="nodrag nowheel w-full accent-purple-500"
              min="0.1"
              max="5.0"
              step="0.1"
              value={data.smoothness || 1.0}
              onChange={handleSmoothnessChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Min Area */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              Min Area: <span className="text-purple-400">{data.minArea || 4}px</span>
            </label>
            <input
              type="range"
              className="nodrag nowheel w-full accent-purple-500"
              min="1"
              max="100"
              value={data.minArea || 4}
              onChange={handleMinAreaChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options Row */}
          <div className="flex gap-4">
            {/* Remove Background */}
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                className="nodrag nowheel accent-purple-500 w-4 h-4"
                checked={data.removeBackground || false}
                onChange={handleRemoveBackgroundChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
              Remove BG
            </label>

            {/* Optimize */}
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                className="nodrag nowheel accent-purple-500 w-4 h-4"
                checked={data.optimize !== false}
                onChange={handleOptimizeChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
              Optimize
            </label>
          </div>

          {/* Info */}
          <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400">
            <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Converts raster images to SVG vectors</span>
          </div>
        </>
      )}
    </CollapsibleNodeWrapper>
  );
}

export default memo(VectorizeNode);

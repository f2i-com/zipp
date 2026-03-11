import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Position, useUpdateNodeInternals, useNodeId } from '@xyflow/react';
import { useNodeResize, CollapsibleNodeWrapper, type HandleConfig, type ValidationIssue } from 'zipp-ui-components';

import type { ProjectConstant, ProjectSettings, AIProvider } from 'zipp-core';

interface AILLMNodeData {
  model?: string;
  systemPrompt?: string;
  endpoint?: string;
  apiKey?: string;
  apiKeyConstant?: string;
  headers?: string;
  imageFormat?: string;
  requestFormat?: string;
  provider?: AIProvider;
  wan2gpModel?: string;
  enableThinking?: boolean;
  contextLength?: number;
  maxTokens?: number;
  imageInputCount?: number;
  projectConstants?: ProjectConstant[];
  projectSettings?: ProjectSettings;
  _status?: 'running' | 'completed' | 'error';
  _collapsed?: boolean;
  onModelChange?: (value: string) => void;
  onSystemPromptChange?: (value: string) => void;
  onEndpointChange?: (value: string) => void;
  onApiKeyChange?: (value: string) => void;
  onApiKeyConstantChange?: (value: string) => void;
  onHeadersChange?: (value: string) => void;
  onImageFormatChange?: (value: string) => void;
  onRequestFormatChange?: (value: string) => void;
  onProviderChange?: (value: AIProvider) => void;
  onWan2gpModelChange?: (value: string) => void;
  onEnableThinkingChange?: (value: boolean) => void;
  onContextLengthChange?: (value: number) => void;
  onMaxTokensChange?: (value: number) => void;
  onImageInputCountChange?: (value: number) => void;
  onCollapsedChange?: (value: boolean) => void;
  showBodyProperties?: boolean;
}

interface AILLMNodeProps {
  data: AILLMNodeData;
}

// Store callbacks in refs to avoid stale closures
function useCallbackRefs(data: AILLMNodeData) {
  const refs = {
    onModelChange: useRef(data.onModelChange),
    onSystemPromptChange: useRef(data.onSystemPromptChange),
    onEndpointChange: useRef(data.onEndpointChange),
    onApiKeyChange: useRef(data.onApiKeyChange),
    onApiKeyConstantChange: useRef(data.onApiKeyConstantChange),
    onHeadersChange: useRef(data.onHeadersChange),
    onImageFormatChange: useRef(data.onImageFormatChange),
    onRequestFormatChange: useRef(data.onRequestFormatChange),
    onProviderChange: useRef(data.onProviderChange),
    onWan2gpModelChange: useRef(data.onWan2gpModelChange),
    onEnableThinkingChange: useRef(data.onEnableThinkingChange),
    onContextLengthChange: useRef(data.onContextLengthChange),
    onMaxTokensChange: useRef(data.onMaxTokensChange),
    onImageInputCountChange: useRef(data.onImageInputCountChange),
    onCollapsedChange: useRef(data.onCollapsedChange),
  };

  useEffect(() => {
    refs.onModelChange.current = data.onModelChange;
    refs.onSystemPromptChange.current = data.onSystemPromptChange;
    refs.onEndpointChange.current = data.onEndpointChange;
    refs.onApiKeyChange.current = data.onApiKeyChange;
    refs.onApiKeyConstantChange.current = data.onApiKeyConstantChange;
    refs.onHeadersChange.current = data.onHeadersChange;
    refs.onImageFormatChange.current = data.onImageFormatChange;
    refs.onRequestFormatChange.current = data.onRequestFormatChange;
    refs.onProviderChange.current = data.onProviderChange;
    refs.onWan2gpModelChange.current = data.onWan2gpModelChange;
    refs.onEnableThinkingChange.current = data.onEnableThinkingChange;
    refs.onContextLengthChange.current = data.onContextLengthChange;
    refs.onMaxTokensChange.current = data.onMaxTokensChange;
    refs.onImageInputCountChange.current = data.onImageInputCountChange;
    refs.onCollapsedChange.current = data.onCollapsedChange;
  });

  return refs;
}

// Provider configurations with their default settings
const AI_PROVIDERS: { value: AIProvider; label: string; endpoint: string; model: string; apiKeyConstant: string; requestFormat: string }[] = [
  { value: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', apiKeyConstant: 'OPENAI_API_KEY', requestFormat: 'openai' },
  { value: 'anthropic', label: 'Anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', apiKeyConstant: 'ANTHROPIC_API_KEY', requestFormat: 'anthropic' },
  { value: 'google', label: 'Google AI', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', apiKeyConstant: 'GOOGLE_API_KEY', requestFormat: 'openai' },
  { value: 'openrouter', label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o', apiKeyConstant: 'OPENROUTER_API_KEY', requestFormat: 'openai' },
  { value: 'groq', label: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', apiKeyConstant: 'GROQ_API_KEY', requestFormat: 'openai' },
  { value: 'ollama', label: 'Ollama (Local)', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2', apiKeyConstant: '', requestFormat: 'openai' },
  { value: 'lmstudio', label: 'LM Studio (Local)', endpoint: 'http://localhost:1234/v1/chat/completions', model: 'local-model', apiKeyConstant: '', requestFormat: 'openai' },
  { value: 'huggingface', label: 'HuggingFace LLM (Local)', endpoint: 'http://127.0.0.1:8774/v1/chat/completions', model: 'Qwen/Qwen3.5-9B', apiKeyConstant: '', requestFormat: 'openai' },
  { value: 'custom', label: 'Custom', endpoint: '', model: '', apiKeyConstant: '', requestFormat: 'openai' },
];

const IMAGE_FORMATS = [
  { value: 'none', label: 'None', description: 'No image input' },
  { value: 'base64_inline', label: 'Base64 Inline', description: 'Image as base64 data URL in message content' },
  { value: 'base64_separate', label: 'Base64 Separate', description: 'Base64 in separate image_url field' },
  { value: 'url', label: 'URL', description: 'Image URL reference in content' },
  { value: 'binary', label: 'Binary', description: 'Raw binary data (for multipart requests)' },
];

// Icon for the node header
const AIIcon = (
  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
  </svg>
);

function AILLMNode({ data }: AILLMNodeProps) {
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();

  const { size, handleResizeStart } = useNodeResize({
    initialWidth: 320,
    initialHeight: 420,
    constraints: { minWidth: 280, maxWidth: 500, minHeight: 350, maxHeight: 700 },
  });
  const [showAdvanced, setShowAdvanced] = useState(
    !!(data.headers || data.imageFormat || (data.imageInputCount && data.imageInputCount > 0))
  );
  const callbackRefs = useCallbackRefs(data);

  // Update React Flow's internal handle registry when image input count changes
  const imageInputCount = data.imageInputCount || 0;
  useEffect(() => {
    if (nodeId) {
      updateNodeInternals(nodeId);
    }
  }, [nodeId, updateNodeInternals, imageInputCount]);

  // Side effects for provider changes
  useEffect(() => {
    const providerValue = data.provider;
    if (!providerValue) return;

    // Find config
    const providerConfig = AI_PROVIDERS.find(p => p.value === providerValue);
    if (providerConfig && providerValue !== 'custom') {
      // Determine endpoint
      let endpoint = providerConfig.endpoint;
      if (providerValue === 'ollama') {
        const baseUrl = data.projectSettings?.ollamaEndpoint || 'http://localhost:11434';
        endpoint = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
      } else if (providerValue === 'lmstudio') {
        const baseUrl = data.projectSettings?.lmstudioEndpoint || 'http://localhost:1234';
        endpoint = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
      }

      // Only update if different (to avoid loops or unnecessary updates)
      if (data.endpoint !== endpoint && callbackRefs.onEndpointChange.current) {
        callbackRefs.onEndpointChange.current(endpoint);
      }
      if (data.model !== providerConfig.model && callbackRefs.onModelChange.current) {
        callbackRefs.onModelChange.current(providerConfig.model);
      }
      if (data.requestFormat !== providerConfig.requestFormat && callbackRefs.onRequestFormatChange.current) {
        callbackRefs.onRequestFormatChange.current(providerConfig.requestFormat);
      }
      if (providerConfig.apiKeyConstant && data.apiKeyConstant !== providerConfig.apiKeyConstant && callbackRefs.onApiKeyConstantChange.current) {
        callbackRefs.onApiKeyConstantChange.current(providerConfig.apiKeyConstant);
      }
      // HuggingFace LLM: pre-configure for vision support (1 image input, base64 inline)
      if (providerValue === 'huggingface') {
        if (!data.imageInputCount && callbackRefs.onImageInputCountChange.current) {
          callbackRefs.onImageInputCountChange.current(1);
        }
        if ((!data.imageFormat || data.imageFormat === 'none') && callbackRefs.onImageFormatChange.current) {
          callbackRefs.onImageFormatChange.current('base64_inline');
        }
      }
    }
  }, [data.provider, data.projectSettings?.ollamaEndpoint, data.projectSettings?.lmstudioEndpoint]);

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onModelChange.current?.(e.target.value);
  }, []);
  const handleSystemPromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    callbackRefs.onSystemPromptChange.current?.(e.target.value);
  }, []);
  const handleEndpointChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onEndpointChange.current?.(e.target.value);
  }, []);
  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onApiKeyChange.current?.(e.target.value);
  }, []);
  const handleApiKeyConstantChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    callbackRefs.onApiKeyConstantChange.current?.(e.target.value);
  }, []);
  const handleHeadersChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    callbackRefs.onHeadersChange.current?.(e.target.value);
  }, []);
  const handleImageFormatChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    callbackRefs.onImageFormatChange.current?.(e.target.value);
  }, []);
  const handleContextLengthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    callbackRefs.onContextLengthChange.current?.(value);
  }, []);
  const handleMaxTokensChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    callbackRefs.onMaxTokensChange.current?.(value);
  }, []);
  const handleEnableThinkingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    callbackRefs.onEnableThinkingChange.current?.(e.target.checked);
  }, []);
  const handleProviderChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerValue = e.target.value as AIProvider;
    callbackRefs.onProviderChange.current?.(providerValue);
    // Side effects are now handled by useEffect
  }, []);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    callbackRefs.onCollapsedChange.current?.(collapsed);
  }, []);

  // Get defaults from project settings if available
  const defaultProvider = data.projectSettings?.defaultAIProvider || 'openai';
  const defaultEndpoint = data.projectSettings?.defaultAIEndpoint || '';
  const defaultModel = data.projectSettings?.defaultAIModel || '';
  const defaultApiKeyConstant = data.projectSettings?.defaultAIApiKeyConstant || '';

  // Use node values, falling back to defaults
  const provider = data.provider || defaultProvider;
  const imageFormat = data.imageFormat || 'none';
  const isCustomProvider = provider === 'custom';
  const projectConstants = data.projectConstants || [];
  const apiKeyConstants = projectConstants.filter(c => c.category === 'api_key');
  const showBody = data.showBodyProperties !== false; // Check visibility

  // Handlers for image input count
  const handleAddImageInput = useCallback(() => {
    const newCount = Math.min((data.imageInputCount || 0) + 1, 10);
    callbackRefs.onImageInputCountChange.current?.(newCount);
  }, [data.imageInputCount]);

  const handleRemoveImageInput = useCallback(() => {
    const newCount = Math.max((data.imageInputCount || 0) - 1, 0);
    callbackRefs.onImageInputCountChange.current?.(newCount);
  }, [data.imageInputCount]);

  // Compute effective values (node overrides or defaults)
  const effectiveEndpoint = data.endpoint || defaultEndpoint;
  const effectiveModel = data.model || defaultModel;
  const effectiveApiKeyConstant = data.apiKeyConstant || defaultApiKeyConstant;

  // Compute validation issues
  const validationIssues = useMemo(() => {
    const issues: ValidationIssue[] = [];
    if (!effectiveEndpoint && isCustomProvider) {
      issues.push({ field: 'Endpoint', message: 'Required for custom provider' });
    }
    if (!effectiveModel && isCustomProvider) {
      issues.push({ field: 'Model', message: 'Required for custom provider' });
    }
    return issues;
  }, [effectiveEndpoint, effectiveModel, isCustomProvider]);

  // Collapsed preview content
  const providerLabel = AI_PROVIDERS.find(p => p.value === provider)?.label || provider;
  const collapsedPreview = (
    <div className="text-slate-600 dark:text-slate-400 space-y-0.5">
      <div className="truncate text-purple-400 font-medium">
        {providerLabel}
      </div>
      {effectiveModel && (
        <div className="truncate text-xs text-slate-500">{effectiveModel}</div>
      )}
    </div>
  );

  // Build handle configurations
  const inputHandles = useMemo<HandleConfig[]>(() => {
    const handles: HandleConfig[] = [
      { id: 'prompt', type: 'target', position: Position.Left, color: '!bg-blue-500', label: 'prompt', labelColor: 'text-blue-400', size: 'lg' },
      { id: 'headers', type: 'target', position: Position.Left, color: '!bg-orange-500', label: 'headers', labelColor: 'text-orange-400', size: 'sm' },
      { id: 'apiKey', type: 'target', position: Position.Left, color: '!bg-yellow-500', label: 'api key', labelColor: 'text-yellow-400', size: 'sm' },
      { id: 'history', type: 'target', position: Position.Left, color: '!bg-purple-400', label: 'history', labelColor: 'text-purple-400', size: 'sm' },
    ];
    // Add dynamic image input handles - first one uses 'image' to match node definition
    for (let i = 0; i < imageInputCount; i++) {
      handles.push({
        id: i === 0 ? 'image' : `image_${i}`,
        type: 'target',
        position: Position.Left,
        color: '!bg-pink-500',
        label: imageInputCount === 1 ? 'image' : `image ${i + 1}`,
        labelColor: 'text-pink-400',
        size: 'sm'
      });
    }
    return handles;
  }, [imageInputCount]);

  const outputHandles = useMemo<HandleConfig[]>(() => [
    { id: 'response', type: 'source', position: Position.Right, color: '!bg-green-500', size: 'lg' },
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
      title="AI / LLM"
      color="purple"
      icon={AIIcon}
      width={size.width}
      collapsedWidth={140}
      status={data._status}
      validationIssues={validationIssues}
      isCollapsed={data._collapsed}
      onCollapsedChange={handleCollapsedChange}
      collapsedPreview={collapsedPreview}
      inputHandles={inputHandles}
      outputHandles={outputHandles}
      resizeHandles={resizeHandles}
    >
      {/* Primary Inputs */}
      {showBody && (
        <>
          {/* Provider Selector (Primary) */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Provider</label>
            <select
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              value={provider}
              onChange={handleProviderChange}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model Input */}
          {(
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              Model {!isCustomProvider && <span className="text-slate-600">(override)</span>}
            </label>
            <input
              type="text"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              placeholder={AI_PROVIDERS.find(p => p.value === provider)?.model || 'gpt-4o'}
              value={data.model || ''}
              onChange={handleModelChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          )}

          {/* API Key from Constants */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              API Key {apiKeyConstants.length > 0 && <span className="text-slate-600">(from settings)</span>}
            </label>
            {apiKeyConstants.length > 0 ? (
              <select
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                value={effectiveApiKeyConstant}
                onChange={handleApiKeyConstantChange}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="">None / Manual</option>
                {apiKeyConstants.map((c) => (
                  <option key={c.id} value={c.key}>
                    {c.name} ({c.key})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="password"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                placeholder="sk-..."
                value={data.apiKey || ''}
                onChange={handleApiKeyChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            )}
          </div>

          {/* System Prompt */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">System Prompt</label>
            <textarea
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-purple-500"
              rows={3}
              placeholder="You are a helpful assistant..."
              value={data.systemPrompt || ''}
              onChange={handleSystemPromptChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        </>
      )}

      {/* Advanced Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 transition-colors"
      >
        <span>Advanced</span>
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
      {showAdvanced && showBody && (
        <div className="space-y-3 pt-1 border-t border-slate-300 dark:border-slate-700">
          {/* Endpoint URL Override */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
              Endpoint URL {!isCustomProvider && <span className="text-slate-600">(override)</span>}
            </label>
            <input
              type="text"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
              placeholder={AI_PROVIDERS.find(p => p.value === provider)?.endpoint || 'https://api.openai.com/v1/chat/completions'}
              value={data.endpoint || ''}
              onChange={handleEndpointChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* ... other advanced inputs ... */}
          {/* Manual API Key (when no constants or need override) */}
          {apiKeyConstants.length > 0 && (
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">
                Manual API Key <span className="text-slate-600">(override)</span>
              </label>
              <input
                type="password"
                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                placeholder="sk-..."
                value={data.apiKey || ''}
                onChange={handleApiKeyChange}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Image Inputs with +/- buttons */}
          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Image Inputs</label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRemoveImageInput}
                disabled={imageInputCount === 0}
                className="nodrag w-8 h-8 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded text-slate-700 dark:text-slate-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="flex-1 text-center text-sm text-slate-700 dark:text-slate-300">
                {imageInputCount} image{imageInputCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={handleAddImageInput}
                disabled={imageInputCount >= 10}
                className="nodrag w-8 h-8 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded text-slate-700 dark:text-slate-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            {imageInputCount > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Images will be sent to the AI for vision analysis
              </p>
            )}
          </div>

          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Image Input Format</label>
            <select
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              value={imageFormat}
              onChange={handleImageFormatChange}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {IMAGE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Context Length (0 = default)</label>
            <input
              type="number"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
              placeholder="32768"
              value={data.contextLength || 0}
              min={0}
              max={131072}
              step={1024}
              onChange={handleContextLengthChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Max Tokens (0 = default 4096)</label>
            <input
              type="number"
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
              placeholder="4096"
              value={data.maxTokens || 0}
              min={0}
              max={32768}
              step={256}
              onChange={handleMaxTokensChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="nodrag accent-purple-500"
                checked={data.enableThinking || false}
                onChange={handleEnableThinkingChange}
              />
              Enable Thinking
              <span className="text-slate-500 text-[10px]">(Qwen 3.5, etc.)</span>
            </label>
          </div>

          <div>
            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Headers (JSON)</label>
            <textarea
              className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-purple-500 font-mono"
              rows={2}
              placeholder='{"X-Custom": "value"}'
              value={data.headers || ''}
              onChange={handleHeadersChange}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </CollapsibleNodeWrapper>
  );
}

export default memo(AILLMNode);

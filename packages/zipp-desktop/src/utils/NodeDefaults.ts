/**
 * Node Defaults Utilities
 *
 * Default configurations and data for workflow nodes.
 * Used when creating new nodes in the workflow builder.
 */

import type { NodeType, ProjectSettings } from 'zipp-core';

/**
 * AI Provider configurations with their default settings.
 * Used for initializing AI/LLM nodes.
 */
export const AI_PROVIDER_CONFIGS: Record<string, { endpoint: string; model: string; requestFormat: string }> = {
  'openai': { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', requestFormat: 'openai' },
  'anthropic': { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', requestFormat: 'anthropic' },
  'google': { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', requestFormat: 'openai' },
  'openrouter': { endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o', requestFormat: 'openai' },
  'groq': { endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', requestFormat: 'openai' },
  'ollama': { endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2', requestFormat: 'openai' },
  'lmstudio': { endpoint: 'http://localhost:1234/v1/chat/completions', model: 'local-model', requestFormat: 'openai' },
  'custom': { endpoint: '', model: '', requestFormat: 'openai' },
};

/**
 * Image Provider configurations with their default settings.
 * Used for initializing Image Generation nodes.
 */
export const IMAGE_PROVIDER_CONFIGS: Record<string, { endpoint: string; model: string }> = {
  'openai': { endpoint: 'https://api.openai.com/v1/images/generations', model: 'gpt-image-1' },
  'gemini': { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', model: 'gemini-2.0-flash-exp' },
  'gemini-3-pro': { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent', model: 'gemini-3-pro-image-preview' },
  'gemini-flash': { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent', model: 'gemini-2.5-flash-preview-05-20' },
  'gemini-2-flash': { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', model: 'gemini-2.0-flash-exp' },
  'comfyui': { endpoint: 'http://localhost:8188', model: '' },
  'custom': { endpoint: '', model: '' },
};

/**
 * Get default data for a node type.
 * Uses project settings to apply user preferences for AI/Image providers.
 *
 * @param type - The node type
 * @param projectSettings - Optional project settings for defaults
 * @returns Default data object for the node type
 */
export function getDefaultNodeData(type: NodeType, projectSettings?: ProjectSettings): Record<string, unknown> {
  switch (type) {
    case 'input_text':
      return { value: 'Hello, World!' };
    case 'input_file':
      return { fileName: '', fileType: '', fileContent: '', filePath: '' };
    case 'ai_llm': {
      // Use project settings defaults if available
      const provider = projectSettings?.defaultAIProvider || 'openai';
      const providerConfig = AI_PROVIDER_CONFIGS[provider] || AI_PROVIDER_CONFIGS['openai'];
      return {
        provider: provider,
        model: projectSettings?.defaultAIModel || providerConfig.model,
        endpoint: projectSettings?.defaultAIEndpoint || providerConfig.endpoint,
        requestFormat: providerConfig.requestFormat,
        apiKeyConstant: projectSettings?.defaultAIApiKeyConstant || '',
        systemPrompt: 'You are a helpful assistant.',
        contextLength: 0,
      };
    }
    case 'logic_block':
      return { code: '// Transform the inputs\nreturn input;', inputCount: 1, inputNames: ['input'] };
    case 'memory':
      return { mode: 'read', key: 'myValue', defaultValue: '' };
    case 'image_gen': {
      // Use project settings defaults if available
      const imgProvider = projectSettings?.defaultImageProvider || 'openai';
      const imgConfig = IMAGE_PROVIDER_CONFIGS[imgProvider] || IMAGE_PROVIDER_CONFIGS['openai'];
      return {
        apiFormat: imgProvider,
        endpoint: projectSettings?.defaultImageEndpoint || imgConfig.endpoint,
        model: projectSettings?.defaultImageModel || imgConfig.model,
        apiKeyConstant: projectSettings?.defaultImageApiKeyConstant || '',
        size: imgProvider === 'openai' ? 'auto' : '',
        quality: imgProvider === 'openai' ? 'auto' : '',
        apiKey: '',
        headers: '',
        wan2gpSteps: 4,
        wan2gpSampler: 'lightning',
      };
    }
    case 'image_view':
      return { label: 'preview', imageUrl: '' };
    case 'image_save':
      return { filename: 'image', format: 'png', imageUrl: '' };
    case 'image_combiner':
      return { inputCount: 2 };
    case 'template':
      return {
        template: '{{var1}}',
        inputCount: 2,
        inputNames: ['var1', 'var2'],
      };
    case 'loop_start':
      return { iterations: 3, loopName: '' };
    case 'loop_end':
      return { stopCondition: 'none', stopValue: '', stopField: '', loopName: '' };
    case 'condition':
      return { operator: 'equals', compareValue: '' };
    case 'subflow':
      return { flowId: '', flowName: '', inputMappings: [], inputCount: 1 };
    case 'output':
      return { label: 'result' };
    case 'browser_session':
      return { browserProfile: 'chrome_windows', sessionMode: 'http', customUserAgent: '', customHeaders: '', initialCookies: '', viewportWidth: 1280, viewportHeight: 800 };
    case 'browser_request':
      return { method: 'GET', url: '', bodyType: 'none', body: '', responseFormat: 'html', followRedirects: true, maxRedirects: 5, waitForSelector: '', waitTimeout: 30000 };
    case 'browser_extract':
      return { extractionType: 'css_selector', selector: '', pattern: '', extractTarget: 'text', attributeName: '', outputFormat: 'first', maxLength: 0 };
    case 'browser_control':
      return { action: 'click', selector: '', value: '', scrollDirection: 'down', scrollAmount: 300, waitTimeout: 30000 };
    case 'database':
      return {
        collectionName: '',
      };
    case 'input_folder':
      return {
        path: '',
        recursive: false,
        includePatterns: '*.png, *.jpg, *.jpeg',
        maxFiles: 100,
      };
    case 'file_read':
      return {
        encoding: 'utf8',
      };
    case 'text_chunker':
      return {
        chunkSize: 2000,
        overlap: 200,
      };
    case 'video_gen':
      return {
        apiFormat: 'comfyui',
        wan2gpModel: 'ltx2_22B_distilled',
        wan2gpDuration: 5,
        wan2gpSteps: 8,
        wan2gpResolution: '832x480',
      };
    case 'video_frame_extractor':
      return {
        fps: 1,  // 1 frame per second
        startTime: 0,
        endTime: 0,
        maxFrames: 100,
        outputFormat: 'jpeg',
        batchSize: 10,  // Default to batches of 10 to prevent OOM on large videos
      };
    case 'file_write':
      return {
        targetPath: '',
        contentType: 'base64',
        createDirectories: true,
      };
    case 'terminal_ai_control': {
      // Use project settings defaults for AI provider if available
      const aiProvider = projectSettings?.defaultAIProvider || 'openai';
      const aiConfig = AI_PROVIDER_CONFIGS[aiProvider] || AI_PROVIDER_CONFIGS['openai'];
      return {
        provider: aiProvider,
        model: projectSettings?.defaultAIModel || aiConfig.model,
        endpoint: projectSettings?.defaultAIEndpoint || aiConfig.endpoint,
        format: aiConfig.requestFormat,
        apiKeyConstant: projectSettings?.defaultAIApiKeyConstant || '',
        taskDescription: '',
        systemPrompt: 'You are an AI assistant controlling a terminal. Analyze the screenshot and determine what to type or what keys to press to accomplish the task. Respond with JSON containing your observation, reasoning, and action.',
        screenshotDelayMs: 500,
        maxIterations: 20,
        maxTokens: 1000,
      };
    }
    default:
      return {};
  }
}

/**
 * Get the configuration for a specific AI provider.
 *
 * @param provider - The provider name
 * @returns Provider configuration or the openai config as fallback
 */
export function getAIProviderConfig(provider: string): { endpoint: string; model: string; requestFormat: string } {
  return AI_PROVIDER_CONFIGS[provider] || AI_PROVIDER_CONFIGS['openai'];
}

/**
 * Get the configuration for a specific image provider.
 *
 * @param provider - The provider name
 * @returns Provider configuration or the openai config as fallback
 */
export function getImageProviderConfig(provider: string): { endpoint: string; model: string } {
  return IMAGE_PROVIDER_CONFIGS[provider] || IMAGE_PROVIDER_CONFIGS['openai'];
}

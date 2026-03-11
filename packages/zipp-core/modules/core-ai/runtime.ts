/**
 * Core AI Module Runtime
 *
 * Provides LLM chat, vision, and custom API request functionality.
 * This module handles communication with AI providers like OpenAI, Anthropic, Ollama, etc.
 */

import type { RuntimeContext, RuntimeModule } from '../../src/module-types';

// Module-level context reference (set during init)
let ctx: RuntimeContext;

// =============================================================================
// INPUT VALIDATION
// =============================================================================

// Maximum endpoint URL length
const MAX_ENDPOINT_LENGTH = 2048;

// Maximum prompt/body length (10MB - allows for base64 images)
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;

/**
 * Validates an AI endpoint URL.
 * @throws Error if the URL is invalid or potentially dangerous.
 */
function validateEndpoint(endpoint: string, context: string): void {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error(`${context}: Endpoint URL is required`);
  }

  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new Error(`${context}: Endpoint URL exceeds maximum length`);
  }

  // Parse and validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    throw new Error(`${context}: Invalid endpoint URL: ${endpoint}`);
  }

  // Only allow http and https
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`${context}: Invalid protocol. Only http and https are allowed.`);
  }

  // Block javascript: and data: URLs
  if (endpoint.toLowerCase().includes('javascript:')) {
    throw new Error(`${context}: JavaScript URLs are not allowed`);
  }
}

/**
 * Validates content length for prompts and request bodies.
 */
function validateContentLength(content: string | undefined, fieldName: string): void {
  if (content && content.length > MAX_CONTENT_LENGTH) {
    const sizeMB = (content.length / 1024 / 1024).toFixed(2);
    throw new Error(`${fieldName} exceeds maximum size of 10MB (current: ${sizeMB}MB)`);
  }
}

/**
 * Parse a chunk reference from text
 * Format: __CHUNK_REF:{"path":"...","index":0,"total":5,"startByte":0,"endByte":1000}__
 */
function parseChunkRef(text: string): {
  path: string;
  index: number;
  total: number;
  startByte: number;
  endByte: number;
} | null {
  const match = text.match(/__CHUNK_REF:({.*?})__/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parse a file reference from text (for rejecting large files)
 */
function parseFileRef(text: string): { path: string; size: number } | null {
  const match = text.match(/__FILE_REF:({.*?})__/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Read chunk content from file using Tauri
 */
async function readChunkContent(chunkRef: {
  path: string;
  startByte: number;
  endByte: number;
}): Promise<string> {
  if (!ctx.tauri) {
    throw new Error('Tauri not available for reading chunks');
  }
  return ctx.tauri.invoke<string>('plugin:zipp-filesystem|read_chunk_content', {
    path: chunkRef.path,
    start: chunkRef.startByte,
    length: chunkRef.endByte - chunkRef.startByte,
  });
}

/**
 * Default maximum dimension for images sent to AI (height or width)
 * Images larger than this will be resized while preserving aspect ratio
 * Can be overridden via module settings 'maxImageDimension'
 */
const DEFAULT_MAX_IMAGE_DIMENSION = 1024;

/**
 * Default maximum base64 size in KB for images sent to AI
 * Images larger than this will be aggressively compressed
 * Can be overridden via module settings 'maxImageSizeKB' or per-node settings
 * Note: Modern vision models accept much larger images (OpenAI up to 20MB)
 * but smaller sizes reduce latency and cost. Increase via node settings if needed.
 */
const DEFAULT_MAX_IMAGE_SIZE_KB = 200;

/**
 * Get the configured max image dimension
 */
function getMaxImageDimension(): number {
  const setting = ctx.getModuleSetting('maxImageDimension');
  if (typeof setting === 'number' && setting > 0) {
    return setting;
  }
  return DEFAULT_MAX_IMAGE_DIMENSION;
}

/**
 * Get the configured max image size in KB
 */
function getMaxImageSizeKB(): number {
  const setting = ctx.getModuleSetting('maxImageSizeKB');
  if (typeof setting === 'number' && setting > 0) {
    return setting;
  }
  return DEFAULT_MAX_IMAGE_SIZE_KB;
}

/**
 * Resize a base64 image to fit within configured limits
 * Prefers Rust backend for better performance (doesn't block UI thread)
 * Falls back to canvas for browser-only environments
 *
 * @param dataUrl - The image data URL to resize
 * @param maxDimensionOverride - Override max dimension (0 = use default)
 * @param maxSizeKBOverride - Override max size in KB (0 = use default)
 */
async function resizeImageIfNeeded(
  dataUrl: string,
  maxDimensionOverride: number = 0,
  maxSizeKBOverride: number = 0
): Promise<string> {
  // Only process data URLs that are images
  if (!dataUrl.startsWith('data:image')) {
    return dataUrl;
  }

  // Use overrides if provided (> 0), otherwise fall back to defaults
  const maxDimension = maxDimensionOverride > 0 ? maxDimensionOverride : getMaxImageDimension();
  const maxSizeKB = maxSizeKBOverride > 0 ? maxSizeKBOverride : getMaxImageSizeKB();

  // Try to use Rust backend for better performance (runs off UI thread)
  if (ctx.tauri) {
    try {
      const result = await ctx.tauri.invoke<{
        success: boolean;
        dataUrl: string | null;
        originalWidth: number;
        originalHeight: number;
        newWidth: number;
        newHeight: number;
        originalSizeKb: number;
        newSizeKb: number;
        error: string | null;
      }>('resize_image', { dataUrl, maxDimension, maxSizeKb: maxSizeKB });

      if (result.success && result.dataUrl) {
        ctx.log('info', `[AI] Image resized via Rust: ${result.originalWidth}x${result.originalHeight} -> ${result.newWidth}x${result.newHeight}, ${result.originalSizeKb}KB -> ${result.newSizeKb}KB`);
        return result.dataUrl;
      } else if (result.error) {
        ctx.log('warn', `[AI] Rust resize failed: ${result.error}, falling back to canvas`);
      }
    } catch (err) {
      ctx.log('warn', `[AI] Rust resize not available: ${err}, falling back to canvas`);
    }
  }

  // Fallback: Check if we're in a browser environment with canvas support
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    ctx.log('info', '[AI] Canvas not available, skipping image resize');
    return dataUrl;
  }

  // Canvas-based fallback for browser-only environments
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const { width, height } = img;
      const originalSizeKB = Math.round(dataUrl.length / 1024);

      // Check if resize is needed (either dimensions too large OR file size too large)
      const dimensionsOk = width <= maxDimension && height <= maxDimension;
      const sizeOk = originalSizeKB <= maxSizeKB;
      const isPng = dataUrl.startsWith('data:image/png');

      // Always convert PNG to JPEG for smaller size, even if dimensions are ok
      if (dimensionsOk && sizeOk && !isPng) {
        ctx.log('info', `[AI] Image ${width}x${height} (${originalSizeKB}KB) within limits, no resize needed`);
        resolve(dataUrl);
        return;
      }

      // Calculate new dimensions preserving aspect ratio
      let newWidth: number;
      let newHeight: number;

      if (width > height) {
        newWidth = Math.min(width, maxDimension);
        newHeight = Math.round(height * (newWidth / width));
      } else {
        newHeight = Math.min(height, maxDimension);
        newWidth = Math.round(width * (newHeight / height));
      }

      // If size is still too large after dimension resize, scale down more aggressively
      if (originalSizeKB > maxSizeKB) {
        const sizeRatio = originalSizeKB / maxSizeKB;
        const scaleFactor = 1 / Math.sqrt(sizeRatio);
        newWidth = Math.max(256, Math.round(newWidth * scaleFactor));
        newHeight = Math.max(256, Math.round(newHeight * scaleFactor));
      }

      ctx.log('info', `[AI] Resizing image via canvas from ${width}x${height} (${originalSizeKB}KB) to ${newWidth}x${newHeight}`);

      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        ctx.log('error', '[AI] Failed to get canvas context');
        resolve(dataUrl);
        return;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(img, 0, 0, newWidth, newHeight);

      let resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

      // If still too large, reduce quality further
      let attempts = 0;
      let quality = 0.8;
      while (resizedDataUrl.length / 1024 > maxSizeKB && attempts < 3 && quality > 0.3) {
        quality -= 0.2;
        resizedDataUrl = canvas.toDataURL('image/jpeg', quality);
        attempts++;
      }

      const newSizeKB = Math.round(resizedDataUrl.length / 1024);
      ctx.log('info', `[AI] Image resized: ${originalSizeKB}KB -> ${newSizeKB}KB (quality: ${quality.toFixed(1)})`);

      resolve(resizedDataUrl);
    };

    img.onerror = () => {
      ctx.log('error', '[AI] Failed to load image for resizing');
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

/**
 * Get user-friendly error message
 */
function getUserFriendlyError(error: string, context: string): string {
  if (error.includes('Failed to fetch') || error.includes('NetworkError')) {
    return `Network error during ${context}. Check your internet connection and endpoint URL.`;
  }
  if (error.includes('401') || error.includes('Unauthorized')) {
    return `Authentication failed for ${context}. Check your API key.`;
  }
  if (error.includes('429') || error.includes('rate limit')) {
    return `Rate limit exceeded for ${context}. Please wait and try again.`;
  }
  if (error.includes('timeout') || error.includes('AbortError')) {
    return `Request timed out for ${context}.`;
  }
  return error;
}

/**
 * Resolve API key from constant name or direct value
 */
function resolveApiKey(apiKeyConstant: string): string {
  if (!apiKeyConstant) return '';

  // Check if this looks like a direct API key (not a constant name)
  // Common prefixes: sk- (OpenAI), anthropic- (Anthropic), gsk_ (Groq), etc.
  if (apiKeyConstant.startsWith('sk-') ||
      apiKeyConstant.startsWith('anthropic-') ||
      apiKeyConstant.startsWith('gsk_') ||
      apiKeyConstant.length > 40) {
    // Likely a direct API key, return as-is
    return apiKeyConstant;
  }

  // Try to get from context's getConstant if available
  if (ctx.getConstant) {
    const key = ctx.getConstant(apiKeyConstant);
    if (key) return key;
  }
  // Try module settings
  const settingKey = ctx.getModuleSetting(apiKeyConstant);
  if (typeof settingKey === 'string') return settingKey;
  // Return empty if not found
  return '';
}

/**
 * Execute LLM chat request
 *
 * Parameters match compiler output:
 * AI.chat(systemPrompt, userPrompt, input, endpoint, model, apiKeyConstant,
 *         streaming, maxTokens, temperature, responseFormat, includeImages,
 *         visionDetail, nodeId, chunkRefs, messageHistory, maxImageDimension, maxImageSizeKB, enableThinking)
 */
async function chat(
  systemPrompt: string,
  userPrompt: string,
  input: unknown,
  endpoint: string,
  model: string,
  apiKeyConstant: string,
  streaming: boolean,
  maxTokens: number,
  temperature: number,
  responseFormat: string,
  includeImages: boolean,
  visionDetail: string,
  nodeId: string,
  chunkRefs: Array<{ documentId: string; content?: string }> = [],
  messageHistory: string | Array<{ role: string; content: string }> = '',
  maxImageDimensionOverride: number = 0,
  maxImageSizeKBOverride: number = 0,
  enableThinking: boolean = false
): Promise<string> {
  // Check for abort before starting
  if (ctx.abortSignal?.aborted) {
    ctx.log('info', '[AI] Aborted by user before chat started');
    return '__ABORT__';
  }

  // Validate inputs before proceeding
  validateEndpoint(endpoint, 'AI chat');
  validateContentLength(systemPrompt, 'System prompt');
  validateContentLength(userPrompt, 'User prompt');

  // Auto-start local services (Wan2GP, Ollama, etc.) if needed
  if (ctx.tauri && endpoint.includes('127.0.0.1')) {
    const portMatch = endpoint.match(/:(\d+)/);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      try {
        const result = await ctx.tauri.invoke<{
          success: boolean;
          port?: number;
          error?: string;
          already_running: boolean;
        }>('ensure_service_ready_by_port', { port });
        if (result.success && result.port && result.port !== port) {
          endpoint = endpoint.replace(`:${port}`, `:${result.port}`);
        }
      } catch {
        // Service auto-start not available
      }
    }
  }

  ctx.onNodeStatus?.(nodeId, 'running');

  // Build the prompt from system + user + input
  let finalPrompt = userPrompt;

  // Normalize input to array of images (can be single string, array, or null)
  // Images can be: data:image URLs, file paths, or URLs
  let imageInputs: string[] = [];

  // Helper to check if a string looks like an image file path
  const isImagePath = (s: string): boolean => {
    const lower = s.toLowerCase();
    return (
      (lower.includes('\\') || lower.includes('/')) &&
      (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
       lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.bmp'))
    );
  };

  // Helper to check if a string is an image URL (http/https with image extension)
  const isImageUrl = (s: string): boolean => {
    try {
      const url = new URL(s);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      // Check the pathname for image extensions (ignoring query params)
      const pathname = url.pathname.toLowerCase();
      // Also check query params for filename with image extension (e.g., ComfyUI)
      const filename = url.searchParams.get('filename')?.toLowerCase() || '';
      return (
        pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ||
        pathname.endsWith('.gif') || pathname.endsWith('.webp') || pathname.endsWith('.bmp') ||
        filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') ||
        filename.endsWith('.gif') || filename.endsWith('.webp') || filename.endsWith('.bmp')
      );
    } catch {
      return false;
    }
  };

  // Helper to fetch an image URL and convert to base64
  const fetchImageUrl = async (url: string): Promise<string | null> => {
    try {
      ctx.log('info', `[AI] Fetching image from URL: ${url}`);
      const response = await ctx.secureFetch(url, {
        method: 'GET',
        purpose: 'Fetch image for AI vision',
      });
      if (!response.ok) {
        ctx.log('warn', `[AI] Failed to fetch image: HTTP ${response.status}`);
        return null;
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const mimeType = blob.type || 'image/png';
      ctx.log('info', `[AI] Fetched image: ${Math.round(base64.length / 1024)}KB, type: ${mimeType}`);
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      ctx.log('error', `[AI] Failed to fetch image URL ${url}: ${err}`);
      return null;
    }
  };

  // Helper to read a local image file and convert to base64
  const readImageFile = async (filePath: string): Promise<string | null> => {
    if (!ctx.tauri) {
      ctx.log('warn', '[AI] Cannot read local file - Tauri not available');
      return null;
    }
    try {
      // Normalize path - remove Windows \\?\ prefix if present
      let normalizedPath = filePath;
      if (normalizedPath.startsWith('\\\\?\\')) {
        normalizedPath = normalizedPath.substring(4);
      }

      const fileContent = await ctx.tauri.invoke<{ content: string; isLargeFile: boolean }>('plugin:zipp-filesystem|read_file', {
        path: normalizedPath,
        readAs: 'base64',
      });

      if (fileContent.content) {
        let dataUrl = fileContent.content;
        if (!dataUrl.startsWith('data:')) {
          const ext = filePath.toLowerCase().split('.').pop() || 'png';
          const mimeTypes: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
          };
          const mime = mimeTypes[ext] || 'image/png';
          dataUrl = `data:${mime};base64,${dataUrl}`;
        }
        ctx.log('info', `[AI] Read image file: ${filePath}`);
        return dataUrl;
      }
    } catch (err) {
      ctx.log('error', `[AI] Failed to read image file ${filePath}: ${err}`);
    }
    return null;
  };

  // Process inputs - can be array or single value
  const inputItems = Array.isArray(input) ? input : (input ? [input] : []);

  for (const item of inputItems) {
    if (typeof item !== 'string' || !item) continue;

    if (item.startsWith('data:image')) {
      // Already base64 data URL
      imageInputs.push(item);
    } else if (isImagePath(item)) {
      // Local file path - need to read it
      const dataUrl = await readImageFile(item);
      if (dataUrl) {
        imageInputs.push(dataUrl);
      }
    } else if (isImageUrl(item)) {
      // HTTP/HTTPS image URL - fetch and convert to base64
      const dataUrl = await fetchImageUrl(item);
      if (dataUrl) {
        imageInputs.push(dataUrl);
      }
    } else {
      // Non-image string input - append to prompt
      finalPrompt = finalPrompt ? `${finalPrompt}\n\n${item}` : item;
    }
  }

  const hasImages = imageInputs.length > 0;

  // Handle chunk references - resolve them to actual content
  if (chunkRefs && chunkRefs.length > 0) {
    ctx.log('info', `[AI] Processing ${chunkRefs.length} chunk reference(s)...`);
    // For now, just note that chunks exist - RAG handling would go here
  }

  // Auto-resolve chunk references in prompt
  const chunkRef = parseChunkRef(finalPrompt);
  if (chunkRef && ctx.tauri) {
    ctx.log('info', `[AI] Reading chunk ${chunkRef.index + 1}/${chunkRef.total} from file...`);
    try {
      finalPrompt = await readChunkContent(chunkRef);
      ctx.log('info', `[AI] Loaded chunk content (${finalPrompt.length} chars)`);
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, 'error');
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      ctx.log('error', `[AI] Failed to read chunk: ${errMsg}`);
      throw new Error(`Failed to read file chunk: ${errMsg}`);
    }
  }

  // Check for file reference (large file without chunking - reject)
  const fileRef = parseFileRef(finalPrompt);
  if (fileRef) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const sizeMB = (fileRef.size / 1024 / 1024).toFixed(2);
    ctx.log('error', `[AI] Cannot send large file (${sizeMB} MB) directly to AI.`);
    throw new Error(
      `File is too large (${sizeMB} MB) to send to AI directly. ` +
      `Please use a Text Chunker node to split it into smaller pieces first.`
    );
  }

  // Resolve API key
  const apiKey = resolveApiKey(apiKeyConstant);

  if (!endpoint) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error('No endpoint configured for AI request');
  }

  ctx.log('info', `[AI] Calling ${model} at ${endpoint}...`);

  try {
    // Determine format based on endpoint
    const isAnthropic = endpoint.includes('anthropic') || endpoint.includes('claude');

    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    let body: Record<string, unknown>;

    // Build messages array
    const messages: Array<{ role: string; content: string | Array<unknown> }> = [];

    // Build system prompt with history context if available
    let effectiveSystemPrompt = systemPrompt;

    // Add message history (previous turns in the conversation)
    // History can be a string (from loop history) or an array of message objects
    if (messageHistory) {
      if (typeof messageHistory === 'string' && messageHistory.length > 0) {
        // History is a string - append to system prompt for context
        const histStr = messageHistory.length > 5000
          ? '...(earlier truncated)...\n' + messageHistory.slice(-5000)
          : messageHistory;
        effectiveSystemPrompt = effectiveSystemPrompt
          ? `${effectiveSystemPrompt}\n\n## Previous Actions\n${histStr}`
          : `## Previous Actions\n${histStr}`;
        ctx.log('info', `[AI] Added history context to system prompt (${messageHistory.length} chars)`);
      } else if (Array.isArray(messageHistory) && messageHistory.length > 0) {
        // History is an array of message objects - add as actual conversation turns
        for (const msg of messageHistory) {
          if (msg.role && msg.content) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
        ctx.log('info', `[AI] Added ${messageHistory.length} history message(s)`);
      }
    }

    if (effectiveSystemPrompt) {
      messages.push({ role: 'system', content: effectiveSystemPrompt });
    }

    // Handle vision - include images if requested
    if (includeImages && hasImages) {
      // Build multimodal message with text and images
      const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [];

      if (finalPrompt) {
        userContent.push({ type: 'text', text: finalPrompt });
      }

      // Add all images, resizing each one with per-node overrides
      for (const imageData of imageInputs) {
        const resizedImage = await resizeImageIfNeeded(imageData, maxImageDimensionOverride, maxImageSizeKBOverride);
        userContent.push({
          type: 'image_url',
          image_url: {
            url: resizedImage,
            detail: visionDetail || 'auto'
          }
        });
      }

      ctx.log('info', `[AI] Including ${imageInputs.length} image(s) in request`);
      messages.push({ role: 'user', content: userContent });
    } else {
      messages.push({ role: 'user', content: finalPrompt });
    }

    if (isAnthropic) {
      // Anthropic Messages API format
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model: model,
        max_tokens: maxTokens || 4096,
        messages: messages.filter(m => m.role !== 'system'), // Anthropic uses system differently
      };
      if (systemPrompt) {
        body.system = systemPrompt;
      }
      if (temperature > 0) {
        body.temperature = temperature;
      }
    } else {
      // OpenAI format (default)
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      body = {
        model: model,
        messages: messages,
        stream: false,
      };
      if (maxTokens > 0) {
        body.max_tokens = maxTokens;
      }
      if (temperature > 0) {
        body.temperature = temperature;
      }
      if (responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
      }
      // For local LLMs (Ollama, LM Studio)
      if (endpoint.includes('localhost') || endpoint.includes('127.0.0.1')) {
        body.options = { num_ctx: 32768 };
      }
      // Pass enable_thinking for models that support reasoning mode (e.g. Qwen 3.5)
      if (enableThinking) {
        body.enable_thinking = true;
      }
    }

    ctx.log('info', `[AI] Sending request...`);

    // Check for abort before sending request
    if (ctx.abortSignal?.aborted) {
      ctx.log('info', '[AI] Aborted by user before sending request');
      ctx.onNodeStatus?.(nodeId, 'completed');
      return '__ABORT__';
    }

    // Claude-as-AI mode: yield for external AI response instead of calling the API
    if (ctx.useClaudeForAI && ctx.yieldForAI) {
      ctx.log('info', `[AI] Claude-as-AI mode: yielding for external response`);

      // Build history array from messageHistory if it's an array
      const historyArray = Array.isArray(messageHistory)
        ? messageHistory.filter(m => m.role && m.content).map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content as string
          }))
        : undefined;

      // Yield and wait for external response
      const externalResponse = await ctx.yieldForAI({
        nodeId,
        systemPrompt: effectiveSystemPrompt || '',
        userPrompt: finalPrompt,
        images: includeImages && hasImages ? imageInputs : undefined,
        history: historyArray,
      });

      ctx.log('info', `[AI] Received external response (${externalResponse.length} chars)`);

      // Stream the response if callback available
      if (ctx.onStreamToken && streaming) {
        ctx.onStreamToken(nodeId, externalResponse);
      }

      ctx.onNodeStatus?.(nodeId, 'completed');
      ctx.log('success', `[AI] Chat completed (via Claude-as-AI)`);
      return externalResponse;
    }

    // Retry loop for 503 (service still loading) with progress logging
    const maxRetries = 60; // Up to ~5 minutes of retrying
    const retryDelayMs = 5000;
    let response: Response | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (ctx.abortSignal?.aborted) {
        return '__ABORT__';
      }
      response = await ctx.secureFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        nodeId,
        purpose: 'AI/LLM chat request',
      });

      if (response.status !== 503) break;

      const errorText = await response.text();
      ctx.log('info', `[AI] Service loading: ${errorText.substring(0, 200)} (retrying in ${retryDelayMs / 1000}s...)`);
      ctx.onNodeStatus?.(nodeId, 'running');
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response';
      throw new Error(`HTTP ${response?.status || 0}: ${errorText.substring(0, 200)}`);
    }

    const responseText = await response.text();
    const data = JSON.parse(responseText);

    // Extract content based on format
    let content: string;
    if (isAnthropic) {
      content = data.content?.[0]?.text || JSON.stringify(data);
    } else {
      content = data.choices?.[0]?.message?.content || data.response || JSON.stringify(data);
    }

    ctx.log('info', `[AI] Response received (${content.length} chars)`);

    // Stream the response if callback available
    if (ctx.onStreamToken && streaming) {
      ctx.onStreamToken(nodeId, content);
    }

    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[AI] Chat completed`);
    return content;

  } catch (error) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';

    // Check for abort
    if (error instanceof Error && (error.name === 'AbortError' || errMsg.includes('aborted'))) {
      return '__ABORT__';
    }

    const userMessage = getUserFriendlyError(errMsg, 'AI chat');
    ctx.log('error', `[AI] ${userMessage}`);
    throw new Error(userMessage);
  }
}

/**
 * Execute vision request (legacy - for backwards compatibility)
 */
async function vision(
  prompt: string,
  imageData: string,
  systemPrompt: string,
  model: string,
  nodeId: string,
  format: string,
  endpoint: string,
  apiKey: string,
  imageFormat: string,
  contextLength: number,
  maxTokens: number,
  maxImageDimension: number = 0,
  maxImageSizeKB: number = 0
): Promise<string> {
  // Delegate to chat with includeImages=true
  return chat(
    systemPrompt,
    prompt,
    imageData,
    endpoint,
    model,
    '', // apiKeyConstant not used, apiKey passed directly
    false, // streaming
    maxTokens,
    0.7, // temperature
    'text', // responseFormat
    imageFormat !== 'none', // includeImages
    'auto', // visionDetail
    nodeId,
    [], // chunkRefs
    '', // messageHistory
    maxImageDimension,
    maxImageSizeKB
  );
}

/**
 * Execute custom API request
 */
async function request(
  body: string,
  endpoint: string,
  apiKey: string,
  nodeId: string
): Promise<string> {
  // Check for abort before starting
  if (ctx.abortSignal?.aborted) {
    ctx.log('info', '[AI] Aborted by user before custom request');
    return '__ABORT__';
  }

  // Validate inputs before proceeding
  validateEndpoint(endpoint, 'Custom API request');
  validateContentLength(body, 'Request body');

  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[AI] Custom request to ${endpoint}...`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Use secureFetch instead of fetch for consistent security checks
    const response = await ctx.secureFetch(endpoint, {
      method: 'POST',
      headers,
      body,
      nodeId,
      purpose: 'Custom API request',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const responseText = await response.text();
    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[AI] Custom request complete (${responseText.length} chars)`);
    return responseText;
  } catch (error) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';

    if (error instanceof Error && (error.name === 'AbortError' || errMsg.includes('aborted'))) {
      return '__ABORT__';
    }

    const userMessage = getUserFriendlyError(errMsg, 'custom request');
    ctx.log('error', `[AI] ${userMessage}`);
    throw new Error(userMessage);
  }
}

/**
 * Core AI Runtime Module
 */
const CoreAIRuntime: RuntimeModule = {
  name: 'AI',

  async init(context: RuntimeContext): Promise<void> {
    ctx = context;
    ctx?.log?.('info', '[AI] Module initialized');
  },

  methods: {
    chat,
    vision,
    request,
  },

  streaming: {
    chat: true,
    vision: true,
  },

  async cleanup(): Promise<void> {
    ctx?.log?.('info', '[AI] Module cleanup');
  },
};

export default CoreAIRuntime;

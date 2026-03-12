/**
 * Project Defaults
 *
 * Default configurations for LLM endpoints, image generation endpoints,
 * HTTP presets, constants, and settings.
 * Extracted from useProject.ts for maintainability.
 */

import type {
  LLMEndpoint,
  ImageGenEndpoint,
  HttpPreset,
  ProjectConstant,
  ProjectSettings,
  ZippProject,
  Flow,
} from 'zipp-core';

// Default LLM endpoints - can mix and match these per-node
export const defaultLLMEndpoints: LLMEndpoint[] = [
  {
    id: 'local-ollama',
    name: 'Local Ollama',
    description: 'Local LLM via Ollama',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3',
    requestFormat: 'openai',
    isLocal: true,
  },
  {
    id: 'local-lmstudio',
    name: 'Local LM Studio',
    description: 'Local LLM via LM Studio',
    endpoint: 'http://localhost:1234/v1/chat/completions',
    requestFormat: 'openai',
    isLocal: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI GPT models (gpt-4o, gpt-4, gpt-3.5-turbo)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    requestFormat: 'openai',
    isLocal: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic Claude models',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    requestFormat: 'anthropic',
    isLocal: false,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple models via OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    requestFormat: 'openai',
    isLocal: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Fast inference with Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    apiKeyEnvVar: 'GROQ_API_KEY',
    requestFormat: 'openai',
    isLocal: false,
  },
];

// Default Image Generation endpoints - can mix and match per-node
export const defaultImageGenEndpoints: ImageGenEndpoint[] = [
  // Cloud APIs
  {
    id: 'openai-gpt-image',
    name: 'OpenAI GPT Image',
    description: 'GPT Image 1 - best quality & text rendering',
    endpoint: 'https://api.openai.com/v1/images/generations',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    apiFormat: 'openai',
    model: 'gpt-image-1',
    defaultSize: '1024x1024',
    defaultQuality: 'high',
    isLocal: false,
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    description: 'Best quality - 4K, thinking, grounding',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    apiFormat: 'gemini-3-pro',
    model: 'gemini-3-pro-image-preview',
    isLocal: false,
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast native image generation via Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    apiFormat: 'gemini-flash',
    model: 'gemini-2.5-flash-preview-05-20',
    isLocal: false,
  },
  {
    id: 'gemini-2-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Experimental image gen with Imagen 3',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    apiFormat: 'gemini-2-flash',
    model: 'gemini-2.0-flash-exp',
    isLocal: false,
  },
  // Local APIs
  {
    id: 'local-comfyui',
    name: 'Local ComfyUI',
    description: 'ComfyUI - use Template node for workflow',
    endpoint: 'http://localhost:8188',
    apiFormat: 'comfyui',
    isLocal: true,
  },
];

// Default HTTP presets
export const defaultHttpPresets: HttpPreset[] = [
  {
    id: 'json-api',
    name: 'JSON API',
    description: 'Generic JSON REST API',
    baseUrl: '',
    defaultHeaders: {
      'Content-Type': 'application/json',
    },
    authType: 'none',
  },
  {
    id: 'webhook',
    name: 'Webhook',
    description: 'Simple webhook endpoint',
    baseUrl: '',
    defaultHeaders: {
      'Content-Type': 'application/json',
    },
    authType: 'none',
  },
];

// Default example flows - demos and macros have been moved to /flows folder
export const defaultExampleFlows: Flow[] = [];

// Default constants (API keys, etc.)
export const defaultConstants: ProjectConstant[] = [
  { id: 'const-openai-key', name: 'OpenAI API Key', key: 'OPENAI_API_KEY', value: '', category: 'api_key', isSecret: true },
  { id: 'const-anthropic-key', name: 'Anthropic API Key', key: 'ANTHROPIC_API_KEY', value: '', category: 'api_key', isSecret: true },
  { id: 'const-google-key', name: 'Google API Key', key: 'GOOGLE_API_KEY', value: '', category: 'api_key', isSecret: true },
  { id: 'const-openrouter-key', name: 'OpenRouter API Key', key: 'OPENROUTER_API_KEY', value: '', category: 'api_key', isSecret: true },
  { id: 'const-groq-key', name: 'Groq API Key', key: 'GROQ_API_KEY', value: '', category: 'api_key', isSecret: true },
  { id: 'const-hf-token', name: 'HuggingFace Token', key: 'HF_TOKEN', value: '', category: 'api_key', isSecret: true },
];

// Default project settings
export const defaultSettings: ProjectSettings = {
  defaultAIProvider: 'huggingface',
  defaultAIEndpoint: 'http://127.0.0.1:8774/v1/chat/completions',
  defaultAIModel: 'Qwen/Qwen3.5-9B',
  defaultAIApiKeyConstant: '',
  defaultImageProvider: 'wan2gp',
  defaultImageEndpoint: 'http://127.0.0.1:8773',
  defaultImageModel: 'qwen',
  defaultImageApiKeyConstant: '',
  defaultVideoProvider: 'wan2gp',
  defaultVideoEndpoint: 'http://127.0.0.1:8773',
  defaultVideoModel: 'ltx2_22B_distilled',
};

// Create empty project
export const createEmptyProject = (): ZippProject => ({
  version: '1.0',
  name: 'Untitled Project',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  flows: [],
  llmEndpoints: [...defaultLLMEndpoints],
  imageGenEndpoints: [...defaultImageGenEndpoints],
  httpPresets: [...defaultHttpPresets],
  constants: [...defaultConstants],
  settings: { ...defaultSettings },
});

// Create demo project with example flows
export const createDemoProject = (): ZippProject => ({
  version: '1.0',
  name: 'Zipp Demo Project',
  description: 'Example project demonstrating Zipp features: AI, Subflows, Logic, HTTP, and Image Generation',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  flows: [...defaultExampleFlows],
  llmEndpoints: [...defaultLLMEndpoints],
  imageGenEndpoints: [...defaultImageGenEndpoints],
  httpPresets: [...defaultHttpPresets],
  constants: [...defaultConstants],
  settings: { ...defaultSettings },
});

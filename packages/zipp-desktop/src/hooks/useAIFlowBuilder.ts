import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  WorkflowGraph,
  ProjectSettings,
  ProjectConstant,
  NodeDefinition,
  ModuleManifest,
} from 'zipp-core';
import {
  parseAIResponse,
  compileFlowPlan,
  decompileFlowPlan,
  summarizeFlowPlan,
} from 'zipp-core';
import type { ModuleNodeInfo } from './useModuleNodes';

// AI Provider configurations
const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514' },
  { id: 'google', name: 'Google', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  { id: 'ollama', name: 'Ollama (Local)', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2' },
  { id: 'lmstudio', name: 'LM Studio (Local)', endpoint: 'http://localhost:1234/v1/chat/completions', model: 'local-model' },
  { id: 'custom', name: 'Custom', endpoint: '', model: '' },
] as const;

// Default API key constant names for each provider
const DEFAULT_API_KEY_CONSTANTS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  ollama: '',
  lmstudio: '',
  custom: '',
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  flowPlan?: string;
  timestamp: Date;
  isApplied?: boolean;
}

export interface AIFlowBuilderSettings {
  provider: string;
  model: string;
  apiKeyConstant: string;
  customEndpoint: string;
  useProjectDefaults: boolean;
}

interface UseAIFlowBuilderOptions {
  projectSettings?: ProjectSettings;
  projectConstants?: ProjectConstant[];
  moduleNodes?: ModuleNodeInfo[];
  getWorkflowGraph: () => WorkflowGraph;
  onApplyGraph: (graph: WorkflowGraph) => void;
}

/**
 * Generate a dynamic system prompt from loaded module nodes
 */
function generateDynamicSystemPrompt(moduleNodes: ModuleNodeInfo[]): string {
  // Group nodes by module
  const moduleMap = new Map<string, { manifest: ModuleManifest; nodes: NodeDefinition[] }>();

  for (const nodeInfo of moduleNodes) {
    const moduleId = nodeInfo.module.id;
    if (!moduleMap.has(moduleId)) {
      moduleMap.set(moduleId, { manifest: nodeInfo.module, nodes: [] });
    }
    moduleMap.get(moduleId)!.nodes.push(nodeInfo.definition);
  }

  // Generate module documentation
  const moduleDocs: string[] = [];
  const nodeTypeDocs: string[] = [];

  for (const [moduleId, { manifest, nodes }] of moduleMap) {
    // Module overview
    moduleDocs.push(`- **${manifest.name}** (${moduleId}): ${manifest.description || 'No description'}`);

    // Node documentation for each node in this module
    for (const node of nodes) {
      const inputs = node.inputs?.map(i => `\`${i.id}\` (${i.type}${i.required ? ', required' : ''})`).join(', ') || 'none';
      const outputs = node.outputs?.map(o => `\`{{stepId.${o.id}}}\``).join(', ') || 'none';

      nodeTypeDocs.push(`### ${node.id}
${node.description || node.name} (from ${manifest.name})
- Inputs: ${inputs}
- Outputs: ${outputs}`);
    }
  }

  return `You are the ZIPP Flow Designer AI. Your job is to create automation workflows as FlowPlan JSON objects.

## Available Modules

The following modules are loaded and available:
${moduleDocs.join('\n')}

## Your Task
Convert the user's natural language description into a structured FlowPlan JSON that can be compiled into a visual workflow.

## FlowPlan Schema

A FlowPlan has this structure:

\`\`\`json
{
  "name": "string - short descriptive name (2-5 words)",
  "description": "string - one sentence describing what this workflow does",
  "inputs": [
    {
      "name": "string - variable name in snake_case",
      "type": "text|folder_path|file_path|number|url",
      "description": "string - what the user should enter here"
    }
  ],
  "collections": [
    {
      "name": "string - collection name",
      "type": "folder_files",
      "from": "string - input name that provides the folder path",
      "include": ["*.png", "*.jpg"],
      "recursive": false,
      "max": 100
    }
  ],
  "loop": {
    "mode": "for_each",
    "over": "string - collection name to iterate over",
    "itemAlias": "string - variable name for current item (e.g., 'file', 'item')",
    "steps": [...]
  },
  "steps": [...]
}
\`\`\`

**Important:** Use \`loop\` when processing multiple items (like files in a folder). Use \`steps\` (without loop) for single-item workflows.

## Available Node Types

${nodeTypeDocs.join('\n\n')}

## Reference Syntax

Use \`{{reference}}\` to connect data between steps:

- \`{{inputName}}\` - Reference an input value (e.g., \`{{source_folder}}\`)
- \`{{itemAlias}}\` - Current item in a loop (e.g., \`{{file}}\`)
- \`{{itemAlias.property}}\` - Property of current item:
  - \`{{file.path}}\` - Full file path
  - \`{{file.name}}\` - File name with extension
  - \`{{file.name_without_ext}}\` - File name without extension
  - \`{{file.ext}}\` - File extension
- \`{{stepId.output}}\` - Output from a previous step
- \`{{stepId.content}}\` - Content from file_read
- \`{{stepId.image}}\` - Image from ai_image

## Rules

1. Use descriptive but short step IDs in snake_case (e.g., "read_image", "generate_prompt")
2. Always include all required fields for each step type
3. For loops over files, create a collection with type "folder_files" first
4. Reference the current loop item using the itemAlias you define
5. Make sure every step has a unique "id" field

## CRITICAL: Image Handling Rules

When working with images (PNG, JPG, JPEG, GIF, WEBP):

1. **file_read for images**: ALWAYS use \`"as": "base64"\` - NEVER use "text"
2. **ai_llm with image input**: ALWAYS include the \`"image"\` field connecting to the file content
3. **Collections for images**: Use appropriate file patterns like \`["*.png", "*.jpg", "*.jpeg"]\`

## Example

User: "Take images from a folder and describe each one"

\`\`\`json
{
  "name": "Describe Images",
  "description": "Analyze images in a folder and generate descriptions",
  "inputs": [
    {"name": "image_folder", "type": "folder_path", "description": "Folder containing images"}
  ],
  "collections": [
    {"name": "images", "type": "folder_files", "from": "image_folder", "include": ["*.png", "*.jpg", "*.jpeg"]}
  ],
  "loop": {
    "mode": "for_each",
    "over": "images",
    "itemAlias": "img",
    "steps": [
      {"id": "read", "type": "file_read", "path": "{{img.path}}", "as": "base64"},
      {"id": "describe", "type": "ai_llm", "prompt": "Describe this image in detail.", "image": "{{read.content}}"},
      {"id": "log", "type": "log", "message": "{{describe.output}}", "label": "{{img.name}}"}
    ]
  }
}
\`\`\``;
}

export function useAIFlowBuilder({
  projectSettings,
  projectConstants,
  moduleNodes,
  getWorkflowGraph,
  onApplyGraph,
}: UseAIFlowBuilderOptions) {
  // Chat messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings - initialize from project defaults
  const [settings, setSettings] = useState<AIFlowBuilderSettings>(() => {
    const defaultProvider = projectSettings?.defaultAIProvider || 'openai';
    return {
      provider: defaultProvider,
      model: projectSettings?.defaultAIModel || AI_PROVIDERS.find(p => p.id === defaultProvider)?.model || '',
      apiKeyConstant: projectSettings?.defaultAIApiKeyConstant || DEFAULT_API_KEY_CONSTANTS[defaultProvider] || '',
      customEndpoint: projectSettings?.defaultAIEndpoint || '',
      useProjectDefaults: true,
    };
  });

  // Update settings when project defaults change
  useEffect(() => {
    if (settings.useProjectDefaults && projectSettings) {
      const defaultProvider = projectSettings.defaultAIProvider || 'openai';
      setSettings(prev => ({
        ...prev,
        provider: defaultProvider,
        model: projectSettings.defaultAIModel || AI_PROVIDERS.find(p => p.id === defaultProvider)?.model || prev.model,
        apiKeyConstant: projectSettings.defaultAIApiKeyConstant || DEFAULT_API_KEY_CONSTANTS[defaultProvider] || prev.apiKeyConstant,
        customEndpoint: projectSettings.defaultAIEndpoint || prev.customEndpoint,
      }));
    }
  }, [projectSettings, settings.useProjectDefaults]);

  // AbortController for canceling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Get API key from constants
  const getApiKey = useCallback((constantName: string): string => {
    if (!constantName || !projectConstants) return '';
    const constant = projectConstants.find(c => c.name === constantName);
    return constant?.value || '';
  }, [projectConstants]);

  // Call AI API
  const callAI = useCallback(async (
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const provider = AI_PROVIDERS.find(p => p.id === settings.provider) || AI_PROVIDERS[0];
    const apiKey = getApiKey(settings.apiKeyConstant);

    const isLocalProvider = ['ollama', 'lmstudio'].includes(settings.provider);
    const isCustomProvider = settings.provider === 'custom';
    const endpoint = settings.customEndpoint || provider.endpoint;
    const model = settings.model || provider.model;

    if (isCustomProvider && !endpoint) {
      throw new Error('Custom provider requires an endpoint URL.');
    }
    if (isCustomProvider && !model) {
      throw new Error('Custom provider requires a model name.');
    }

    if (!apiKey && !isLocalProvider && !isCustomProvider) {
      throw new Error(`No API key configured for ${provider.name}. Set ${settings.apiKeyConstant || 'an API key constant'} in project settings.`);
    }

    const isAnthropic = settings.provider === 'anthropic';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isAnthropic) {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = isAnthropic
      ? {
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }
      : {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
          max_tokens: 4096,
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: abortControllerRef.current.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();

    if (isAnthropic) {
      return data.content?.[0]?.text || '';
    }
    return data.choices?.[0]?.message?.content || '';
  }, [settings, getApiKey]);

  // Generate unique ID
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // Get current flow context for AI
  const getCurrentFlowContext = useCallback((): string => {
    const graph = getWorkflowGraph();
    if (!graph || graph.nodes.length === 0) {
      return 'The canvas is currently empty. Create a new workflow based on the user request.';
    }

    const result = decompileFlowPlan(graph);
    if (result.success && result.plan) {
      return `Current workflow context:\n\`\`\`json\n${JSON.stringify(result.plan, null, 2)}\n\`\`\`\n\nSummary: ${summarizeFlowPlan(result.plan)}`;
    }

    // Fallback: basic node summary
    const nodeTypes = graph.nodes.map(n => n.type).join(', ');
    return `Current workflow has ${graph.nodes.length} nodes (${nodeTypes}) and ${graph.edges.length} connections.`;
  }, [getWorkflowGraph]);

  // Extract FlowPlan from AI response
  const extractFlowPlan = useCallback((response: string): string | null => {
    // Try to find JSON in the response
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    // Try to find raw JSON object
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        JSON.parse(objectMatch[0]);
        return objectMatch[0];
      } catch {
        return null;
      }
    }

    return null;
  }, []);

  // Send message to AI
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Build context
      const flowContext = getCurrentFlowContext();

      // Build system prompt from loaded modules (dynamic) or empty fallback
      const baseSystemPrompt = moduleNodes && moduleNodes.length > 0
        ? generateDynamicSystemPrompt(moduleNodes)
        : 'You are an AI assistant helping to build workflows. Describe what nodes you would use.';

      const enhancedSystemPrompt = `${baseSystemPrompt}

## Current Workflow Context

${flowContext}

## Chat Instructions

You are helping the user build or modify a workflow. Based on the conversation:
- If the user asks to CREATE a new workflow, generate a complete FlowPlan JSON
- If the user asks to MODIFY the existing workflow, generate an updated FlowPlan JSON
- If the user asks a QUESTION about their workflow or how to do something, answer conversationally
- Always explain what you're doing before providing FlowPlan JSON
- When providing FlowPlan JSON, wrap it in \`\`\`json code blocks`;

      // Build message history for context
      const historyForAI = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      historyForAI.push({ role: 'user', content: userMessage });

      // Call AI
      const response = await callAI(enhancedSystemPrompt, historyForAI);

      // Extract FlowPlan if present
      const flowPlan = extractFlowPlan(response);

      // Add assistant message
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response,
        flowPlan: flowPlan || undefined,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      // Don't show error for cancelled requests
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, moduleNodes, getCurrentFlowContext, callAI, extractFlowPlan]);

  // Apply FlowPlan to workflow
  const applyFlowPlan = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message?.flowPlan) return;

    try {
      const parseResult = parseAIResponse(message.flowPlan);
      if (!parseResult.success || !parseResult.plan) {
        setError(`Failed to parse FlowPlan: ${parseResult.error}`);
        return;
      }

      // Get compiler options from settings
      const provider = AI_PROVIDERS.find(p => p.id === settings.provider) || AI_PROVIDERS[0];
      const isLocalProvider = ['ollama', 'lmstudio'].includes(settings.provider);
      const isCustomProvider = settings.provider === 'custom';
      const resolvedEndpoint = (isLocalProvider || isCustomProvider)
        ? (settings.customEndpoint || provider.endpoint)
        : provider.endpoint;

      const compilerOptions = {
        // AI LLM settings
        aiModel: settings.model || provider.model,
        aiEndpoint: resolvedEndpoint,
        aiApiKeyConstant: settings.apiKeyConstant,
        aiRequestFormat: settings.provider === 'anthropic' ? 'anthropic' as const : 'openai' as const,
        aiProvider: settings.provider,
        // Image generation settings from project settings
        imageModel: projectSettings?.defaultImageModel,
        imageEndpoint: projectSettings?.defaultImageEndpoint,
        imageApiKeyConstant: projectSettings?.defaultImageApiKeyConstant,
        imageApiFormat: projectSettings?.defaultImageProvider,
      };

      const compilation = compileFlowPlan(parseResult.plan, compilerOptions);
      if (!compilation.success || !compilation.graph) {
        setError(`Failed to compile FlowPlan: ${compilation.errors.join(', ')}`);
        return;
      }

      // Apply the graph
      onApplyGraph(compilation.graph);

      // Mark message as applied
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isApplied: true } : m
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [messages, settings, onApplyGraph, projectSettings]);

  // Update settings
  const updateSettings = useCallback((updates: Partial<AIFlowBuilderSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...updates };

      // If provider changed, update model and API key constant
      if (updates.provider && updates.provider !== prev.provider) {
        const newProvider = AI_PROVIDERS.find(p => p.id === updates.provider);
        if (newProvider) {
          updated.model = updates.model || newProvider.model;
          updated.apiKeyConstant = updates.apiKeyConstant || DEFAULT_API_KEY_CONSTANTS[updates.provider] || '';
        }
      }

      return updated;
    });
  }, []);

  // Clear chat
  const clearChat = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsLoading(false);
  }, []);

  // Cancel current request
  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    // State
    messages,
    isLoading,
    error,
    settings,

    // Actions
    sendMessage,
    applyFlowPlan,
    updateSettings,
    clearChat,
    cancelRequest,

    // Constants
    providers: AI_PROVIDERS,
  };
}

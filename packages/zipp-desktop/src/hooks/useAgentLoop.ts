/**
 * Agent Loop Hook
 *
 * Manages an autonomous AI agent that can create, execute, assess, and iterate on flows.
 * The agent operates as a state machine, taking actions to achieve a user-defined goal.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkflowGraph, ProjectConstant, ProjectSettings, Flow } from 'zipp-core';
import { parseAIResponse, compileFlowPlan } from 'zipp-core';
import type { ModuleNodeInfo } from './useModuleNodes';
import * as agentApi from '../services/agentApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('Agent');

// ============================================================================
// Types
// ============================================================================

export type AgentState =
  | 'idle'
  | 'planning'
  | 'waiting_approval'
  | 'executing'
  | 'assessing'
  | 'iterating'
  | 'complete'
  | 'error';

export type AgentActionType =
  | 'create_flow'
  | 'modify_flow'
  | 'run_flow'
  | 'start_service'
  | 'stop_service'
  | 'complete'
  | 'error';

export interface AgentAttachment {
  type: 'file' | 'folder';
  path: string;
  name: string;
}

export interface AgentStep {
  id: string;
  stepNumber: number;
  action: AgentActionType;
  description: string;
  reasoning: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  payload?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: Date;
}

export interface AgentConfig {
  maxIterations: number;
  approvalMode: boolean;
  autoStartServices: boolean;
  autoRunFlows: boolean;
}

export interface AgentLoopState {
  status: AgentState;
  goal: string | null;
  attachments: AgentAttachment[];
  steps: AgentStep[];
  currentStep: AgentStep | null;
  iterationCount: number;
  progress: number;
  activeFlowId: string | null;
  activeJobId: string | null;
  lastJobOutput: unknown;
  error: string | null;
}

export interface UseAgentLoopOptions {
  projectSettings?: ProjectSettings;
  projectConstants?: ProjectConstant[];
  moduleNodes?: ModuleNodeInfo[];
  flows?: Flow[];
  services?: agentApi.ServiceInfo[];
  onFlowCreated?: (flowId: string, graph: WorkflowGraph) => void;
  onFlowUpdated?: (flowId: string, graph: WorkflowGraph) => void;
  /** Callback for creating flows with proper state sync (uses parent's flow management) */
  createFlowForAgent?: (name: string, graph: WorkflowGraph) => Promise<{ flowId: string }>;
}

export interface UseAgentLoopReturn {
  // State
  state: AgentLoopState;
  config: AgentConfig;
  isRunning: boolean;
  pendingAttachments: AgentAttachment[];

  // Controls
  start: (goal: string, attachments?: AgentAttachment[]) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;

  // Approval mode
  approve: () => void;
  reject: (reason?: string) => void;

  // Configuration
  updateConfig: (updates: Partial<AgentConfig>) => void;

  // Attachments
  addAttachment: (attachment: AgentAttachment) => void;
  removeAttachment: (path: string) => void;
  clearAttachments: () => void;
}

// ============================================================================
// AI Provider Configuration (matching useAIFlowBuilder)
// ============================================================================

const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514' },
  { id: 'google', name: 'Google', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  { id: 'ollama', name: 'Ollama (Local)', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2' },
  { id: 'lmstudio', name: 'LM Studio (Local)', endpoint: 'http://localhost:1234/v1/chat/completions', model: 'local-model' },
  { id: 'huggingface', name: 'HuggingFace LLM (Local)', endpoint: 'http://127.0.0.1:8774/v1/chat/completions', model: 'Qwen/Qwen3.5-9B' },
  { id: 'custom', name: 'Custom', endpoint: '', model: '' },
] as const;

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

// ============================================================================
// System Prompt Generation
// ============================================================================

function generateAgentSystemPrompt(
  moduleNodes: ModuleNodeInfo[],
  services: agentApi.ServiceInfo[],
  flows: Flow[],
  attachments: AgentAttachment[]
): string {
  // Generate detailed node documentation grouped by category
  const categoryMap = new Map<string, ModuleNodeInfo[]>();
  for (const node of moduleNodes) {
    const category = node.category || 'Other';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(node);
  }

  // Build detailed node docs with step types and descriptions
  const nodeDocsLines: string[] = [];
  for (const [category, nodes] of categoryMap) {
    nodeDocsLines.push(`\n### ${category}`);
    for (const node of nodes.slice(0, 15)) { // Limit per category
      const def = node.definition;
      const stepTypes = def.flowplan?.stepTypes?.join(', ') || def.id;
      const desc = def.description ? ` - ${def.description}` : '';
      const inputs = def.inputs.map(i => i.id).join(', ');
      const outputs = def.outputs.map(o => o.id).join(', ');
      nodeDocsLines.push(`- **${def.name}** (step type: \`${stepTypes}\`)${desc}`);
      if (inputs) nodeDocsLines.push(`  - Inputs: ${inputs}`);
      if (outputs) nodeDocsLines.push(`  - Outputs: ${outputs}`);
    }
  }
  const nodeDocs = nodeDocsLines.join('\n');

  const serviceDocs = services.length > 0
    ? services.map(s => `- ${s.id}: ${s.name} (${s.running ? 'RUNNING' : 'stopped'})`).join('\n')
    : '(No services configured)';

  const flowDocs = flows.length > 0
    ? flows.slice(0, 20).map(f => `- ${f.id}: ${f.name}`).join('\n')
    : '(No existing flows)';

  const attachmentDocs = attachments.length > 0
    ? `\n## User Attachments\nThe user has attached these files/folders for you to use:\n${attachments.map(a => `- ${a.type}: ${a.path}`).join('\n')}\n\nUse these as default inputs when creating flows.`
    : '';

  return `You are ZIPP Agent - an autonomous workflow automation AI.

Your job is to achieve the user's goal by creating and running automation workflows.

## Your Capabilities

You can take these actions (one at a time):

1. **CREATE_FLOW** - Create a new workflow
   Payload: { "name": "flow name", "flowPlan": { FlowPlan JSON } }

2. **MODIFY_FLOW** - Modify an existing workflow
   Payload: { "flowId": "id", "flowPlan": { FlowPlan JSON } }

3. **RUN_FLOW** - Execute a workflow
   Payload: { "flowId": "id", "inputs": { optional input values } }

4. **START_SERVICE** - Start a required service
   Payload: { "serviceId": "service-id" }

5. **STOP_SERVICE** - Stop a running service
   Payload: { "serviceId": "service-id" }

6. **COMPLETE** - Mark the goal as achieved
   Payload: { "summary": "what was accomplished" }

## Available Nodes
${nodeDocs}

## Available Services
${serviceDocs}

## Existing Flows
${flowDocs}
${attachmentDocs}

## Response Format

ALWAYS respond with valid JSON in this exact structure:

\`\`\`json
{
  "reasoning": "Your step-by-step thinking about what to do next",
  "action": "CREATE_FLOW|MODIFY_FLOW|RUN_FLOW|START_SERVICE|STOP_SERVICE|COMPLETE",
  "description": "Brief human-readable description of this action",
  "payload": { ... action-specific data ... },
  "progress": 0-100,
  "nextStep": "What you plan to do after this action"
}
\`\`\`

## FlowPlan Format & Examples

When creating or modifying flows, use the FlowPlan DSL:

### Basic Structure
\`\`\`json
{
  "name": "Flow Name",
  "description": "What this flow does",
  "inputs": [...],
  "steps": [...],
  "output": { "result": "{{step_id}}" }
}
\`\`\`

### Example 1: Simple AI Text Processing
\`\`\`json
{
  "name": "Describe Image",
  "inputs": [
    { "name": "image_path", "type": "file_path", "description": "Path to image file" }
  ],
  "steps": [
    {
      "id": "read_img",
      "type": "file_read",
      "path": "{{image_path}}",
      "as": "base64"
    },
    {
      "id": "describe",
      "type": "ai_llm",
      "prompt": "Describe this image in detail",
      "image": "{{read_img}}"
    }
  ],
  "output": { "result": "{{describe}}" }
}
\`\`\`

### Example 2: Process Multiple Files (Loop)
\`\`\`json
{
  "name": "Batch Image Description",
  "inputs": [
    { "name": "folder", "type": "folder_path", "description": "Folder containing images" }
  ],
  "collections": [
    { "name": "images", "type": "folder_files", "from": "folder", "include": ["*.png", "*.jpg"] }
  ],
  "loop": {
    "mode": "for_each",
    "over": "images",
    "itemAlias": "img",
    "steps": [
      {
        "id": "read",
        "type": "file_read",
        "path": "{{img.path}}",
        "as": "base64"
      },
      {
        "id": "describe",
        "type": "ai_llm",
        "prompt": "Describe: {{img.name}}",
        "image": "{{read}}"
      },
      {
        "id": "save",
        "type": "file_write",
        "path": "{{img.path}}.txt",
        "content": "{{describe}}"
      }
    ]
  },
  "output": { "result": "Processed all images" }
}
\`\`\`

### Example 3: HTTP Request
\`\`\`json
{
  "name": "Fetch and Analyze",
  "inputs": [
    { "name": "api_url", "type": "url", "description": "API URL to fetch" }
  ],
  "steps": [
    {
      "id": "fetch",
      "type": "http_request",
      "url": "{{api_url}}",
      "method": "GET"
    },
    {
      "id": "analyze",
      "type": "ai_llm",
      "prompt": "Summarize this data: {{fetch}}"
    }
  ],
  "output": { "result": "{{analyze}}" }
}
\`\`\`

### Step Types Quick Reference (EXACT names to use)
**Input:**
- \`input_folder\` - Scan folder for files (path, includePatterns, recursive, maxFiles)

**File Operations:**
- \`file_read\` - Read file (path, as: text|base64)
- \`file_write\` - Write file (path, content, contentType)

**AI:**
- \`ai_llm\` - AI text generation (prompt, optional image for vision)
- \`ai_image\` - AI image generation (prompt)

**Browser (requires playwright-browser service):**
- \`browser_session\` - Start browser session
- \`browser_extract\` - Extract data from page
- \`http_request\` - HTTP request (url, method, body)

**Utility:**
- \`template\` - Text template with {{variables}}
- \`output\` - Flow output/result

**Flow Control:**
- \`condition\` - Conditional branching
- \`loop\` - Loop construct

### Input Types (for "inputs" array)
- \`text\` - Plain text input
- \`file_path\` - Single file path
- \`folder_path\` - Folder path
- \`number\` - Numeric input
- \`url\` - URL input

### Collections (alternative to input_folder step)
You can also use the collections array with \`folder_files\` type:
\`\`\`json
"collections": [
  { "name": "images", "type": "folder_files", "from": "folder_input_name", "include": ["*.png", "*.jpg"] }
]
\`\`\`
Then loop over it with \`"loop": { "over": "images", ... }\`

### Template References
Use \`{{step_id}}\` to reference previous step outputs
Use \`{{input_name}}\` to reference flow inputs
In loops: \`{{item.path}}\`, \`{{item.name}}\`, \`{{item.content}}\`

## Rules

1. **Be autonomous** - Make decisions without asking for clarification
2. **Start services first** - If a flow needs browser automation, start playwright-browser first
3. **Handle errors** - If a flow fails, analyze the error and try to fix it
4. **Use attachments** - When the user attaches files/folders, use them as flow inputs
5. **One action at a time** - Each response should contain exactly ONE action
6. **Progress tracking** - Update progress percentage based on how close you are to the goal
7. **Complete when done** - Use COMPLETE action when the goal is fully achieved
8. **Always include output** - Every FlowPlan must have an "output" field with "result"
`;
}

// ============================================================================
// Hook Implementation
// ============================================================================

const DEFAULT_CONFIG: AgentConfig = {
  maxIterations: 10,
  approvalMode: true,
  autoStartServices: true,
  autoRunFlows: false,
};

const initialState: AgentLoopState = {
  status: 'idle',
  goal: null,
  attachments: [],
  steps: [],
  currentStep: null,
  iterationCount: 0,
  progress: 0,
  activeFlowId: null,
  activeJobId: null,
  lastJobOutput: null,
  error: null,
};

export function useAgentLoop({
  projectSettings,
  projectConstants,
  moduleNodes = [],
  flows = [],
  services = [],
  onFlowCreated,
  onFlowUpdated,
  createFlowForAgent,
}: UseAgentLoopOptions): UseAgentLoopReturn {
  // State
  const [state, setState] = useState<AgentLoopState>(initialState);
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([]);

  // Refs for async operations
  const abortControllerRef = useRef<AbortController | null>(null);
  const approvalResolverRef = useRef<((approved: boolean, reason?: string) => void) | null>(null);
  const isRunningRef = useRef(false);
  const configRef = useRef(config);
  const stateRef = useRef(state);

  // Keep refs in sync so running loop can access latest values
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
    const providerId = projectSettings?.defaultAIProvider || 'huggingface';
    const provider = AI_PROVIDERS.find(p => p.id === providerId) || AI_PROVIDERS[0];
    // Use provider.id for lookup to handle case where providerId doesn't match exactly
    const apiKeyConstant = projectSettings?.defaultAIApiKeyConstant || DEFAULT_API_KEY_CONSTANTS[provider.id] || '';
    const apiKey = getApiKey(apiKeyConstant);
    const model = projectSettings?.defaultAIModel || provider.model;

    // Check if this is a local/custom provider that doesn't require an API key
    const isLocalProvider = ['ollama', 'lmstudio', 'huggingface', 'custom'].includes(provider.id);

    // Get endpoint - use custom endpoint from settings if configured, otherwise use provider default
    const endpoint = projectSettings?.defaultAIEndpoint || provider.endpoint;

    if (!endpoint) {
      throw new Error(`No endpoint configured for ${provider.name}. Please configure a custom endpoint in project settings.`);
    }

    if (!apiKey && !isLocalProvider) {
      const keyName = apiKeyConstant || DEFAULT_API_KEY_CONSTANTS[provider.id] || `${provider.id.toUpperCase()}_API_KEY`;
      throw new Error(`No API key configured for ${provider.name}. Set ${keyName} in project constants.`);
    }

    const isAnthropic = provider.id === 'anthropic';

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
          messages,
        }
      : {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          temperature: 0.7,
          max_tokens: 4096,
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: abortControllerRef.current?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();

    if (isAnthropic) {
      return data.content?.[0]?.text || '';
    }
    return data.choices?.[0]?.message?.content || '';
  }, [projectSettings, getApiKey]);

  // Parse AI response to extract action
  const parseAgentResponse = useCallback((response: string): {
    reasoning: string;
    action: AgentActionType;
    description: string;
    payload: Record<string, unknown>;
    progress: number;
    nextStep: string;
  } | null => {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : response;

      const parsed = JSON.parse(jsonStr);

      // Normalize action to lowercase with underscores
      const normalizedAction = parsed.action?.toLowerCase()?.replace(/-/g, '_') as AgentActionType;

      return {
        reasoning: parsed.reasoning || '',
        action: normalizedAction,
        description: parsed.description || '',
        payload: parsed.payload || {},
        progress: Math.min(100, Math.max(0, parsed.progress || 0)),
        nextStep: parsed.nextStep || '',
      };
    } catch (err) {
      logger.error('Failed to parse response', { error: err });
      return null;
    }
  }, []);

  // Execute a single action
  const executeAction = useCallback(async (
    step: AgentStep
  ): Promise<{ success: boolean; result?: unknown; error?: string }> => {
    const { action, payload } = step;

    try {
      switch (action) {
        case 'create_flow': {
          // Handle both formats:
          // 1. { name: "...", flowPlan: { ... } } - wrapped format
          // 2. { name: "...", inputs: [...], steps: [...] } - direct FlowPlan format
          const payloadObj = payload as Record<string, unknown>;
          let flowPlan: unknown;
          let flowName: string;

          if (payloadObj.flowPlan) {
            // Wrapped format
            flowPlan = payloadObj.flowPlan;
            flowName = (payloadObj.name as string) || '';
          } else if (payloadObj.inputs || payloadObj.steps || payloadObj.loop) {
            // Direct FlowPlan format - the payload IS the flowPlan
            flowPlan = payload;
            flowName = (payloadObj.name as string) || '';
          } else {
            return { success: false, error: 'No flowPlan provided in payload. Expected { flowPlan: {...} } or a direct FlowPlan object.' };
          }

          // Parse and compile the FlowPlan
          const parseResult = parseAIResponse(JSON.stringify(flowPlan));
          if (!parseResult.success || !parseResult.plan) {
            return { success: false, error: `Invalid FlowPlan: ${parseResult.error}` };
          }

          // Build collectionPaths from folder attachments
          // Maps collection names and input names to folder paths
          // Use stateRef to get latest attachments (avoid stale closure)
          const collectionPaths: Record<string, string> = {};
          const currentAttachments = stateRef.current.attachments;
          logger.debug('Building collectionPaths', { attachments: currentAttachments });
          const folderAttachments = currentAttachments.filter(a => a.type === 'folder');
          logger.debug('Folder attachments', { folders: folderAttachments });
          if (folderAttachments.length > 0) {
            const firstFolderPath = folderAttachments[0].path;

            // Map common input/collection names to the first folder path
            collectionPaths['folder'] = firstFolderPath;
            collectionPaths['folder_path'] = firstFolderPath;
            collectionPaths['input_folder'] = firstFolderPath;
            collectionPaths['images'] = firstFolderPath;
            collectionPaths['files'] = firstFolderPath;

            // Map each collection from the FlowPlan to folder paths
            if (parseResult.plan.collections) {
              for (let i = 0; i < parseResult.plan.collections.length; i++) {
                const coll = parseResult.plan.collections[i];
                const folderPath = folderAttachments[i]?.path || firstFolderPath;
                collectionPaths[coll.name] = folderPath;
                if (coll.from) {
                  collectionPaths[coll.from] = folderPath;
                }
              }
            }

            // Map folder_path inputs to folder paths
            if (parseResult.plan.inputs) {
              for (let i = 0; i < parseResult.plan.inputs.length; i++) {
                const input = parseResult.plan.inputs[i];
                if (input.type === 'folder_path') {
                  const folderPath = folderAttachments[i]?.path || firstFolderPath;
                  collectionPaths[input.name] = folderPath;
                }
              }
            }
          }

          // Get compiler options
          const providerId = projectSettings?.defaultAIProvider || 'huggingface';
          const provider = AI_PROVIDERS.find(p => p.id === providerId) || AI_PROVIDERS[0];
          const compilerOptions = {
            aiModel: projectSettings?.defaultAIModel || provider.model,
            aiEndpoint: provider.endpoint,
            aiApiKeyConstant: projectSettings?.defaultAIApiKeyConstant || DEFAULT_API_KEY_CONSTANTS[providerId],
            aiRequestFormat: providerId === 'anthropic' ? 'anthropic' as const : 'openai' as const,
            aiProvider: providerId,
            imageModel: projectSettings?.defaultImageModel,
            imageEndpoint: projectSettings?.defaultImageEndpoint,
            imageApiKeyConstant: projectSettings?.defaultImageApiKeyConstant,
            imageApiFormat: projectSettings?.defaultImageProvider,
            collectionPaths,
          };

          logger.debug('Compiling with collectionPaths', { collectionPaths, collections: parseResult.plan.collections, inputs: parseResult.plan.inputs });
          const compilation = compileFlowPlan(parseResult.plan, compilerOptions);
          if (!compilation.success || !compilation.graph) {
            return { success: false, error: `Compilation failed: ${compilation.errors?.join(', ')}` };
          }
          logger.debug(`Compilation successful, graph nodes: ${compilation.graph.nodes.length}`);

          // Post-compilation: ensure input_folder nodes have paths
          // This is a fallback in case the collectionPaths name matching didn't work
          const inputFolderNodes = compilation.graph.nodes.filter(n => n.type === 'input_folder');
          if (folderAttachments.length > 0) {
            const firstFolderPath = folderAttachments[0].path;
            for (const node of inputFolderNodes) {
              if (!node.data.path || node.data.path === '') {
                logger.debug(`Post-compilation: patching empty path for node ${node.id} with ${firstFolderPath}`);
                node.data.path = firstFolderPath;
              }
            }
          }
          logger.debug('input_folder nodes after patching', { nodes: inputFolderNodes.map(n => ({ id: n.id, path: n.data.path })) });

          // Create flow - prefer parent's callback for proper state sync
          const finalFlowName = flowName || parseResult.plan.name || 'Agent Flow';
          let newFlowId: string;

          if (createFlowForAgent) {
            // Use parent's flow creation (updates state properly)
            const result = await createFlowForAgent(finalFlowName, compilation.graph);
            newFlowId = result.flowId;
          } else {
            // Fallback to direct API call (may not sync with UI state)
            const newFlow = await agentApi.createFlow(finalFlowName);
            await agentApi.updateFlowGraph(newFlow.id, compilation.graph);
            newFlowId = newFlow.id;
            // Notify parent to load graph
            onFlowCreated?.(newFlowId, compilation.graph);
          }

          setState(prev => ({ ...prev, activeFlowId: newFlowId }));

          // Auto-run flow if enabled
          logger.debug(`Auto-run enabled: ${configRef.current.autoRunFlows}`);
          if (configRef.current.autoRunFlows) {
            // Build inputs from attachments (use stateRef for latest)
            const inputs: Record<string, unknown> = {};
            const attachmentsForRun = stateRef.current.attachments;
            logger.debug('Auto-run: attachments for run', { attachments: attachmentsForRun, flowInputs: parseResult.plan.inputs });
            if (attachmentsForRun.length > 0) {
              // Try to match attachments to flow inputs
              for (const input of parseResult.plan.inputs || []) {
                const matchingAttachment = attachmentsForRun.find(a => {
                  if (input.type === 'folder_path' && a.type === 'folder') return true;
                  if (input.type === 'file_path' && a.type === 'file') return true;
                  return false;
                });
                if (matchingAttachment) {
                  inputs[input.name] = matchingAttachment.path;
                }
              }
            }

            logger.debug('Auto-run: inputs built', { inputs });
            try {
              logger.debug(`Auto-run: starting flow ${newFlowId}`, { inputs });
              const { jobId } = await agentApi.runFlow(newFlowId, inputs);
              logger.debug(`Auto-run: job started: ${jobId}`);
              const jobResult = await agentApi.waitForJob(jobId, { timeout: 120000 });
              logger.debug('Auto-run: job completed', { jobResult });
              return {
                success: true,
                result: {
                  flowId: newFlowId,
                  graph: compilation.graph,
                  autoRun: true,
                  jobId,
                  jobResult,
                },
              };
            } catch (runError) {
              // Flow was created but auto-run failed
              return {
                success: true,
                result: {
                  flowId: newFlowId,
                  graph: compilation.graph,
                  autoRun: false,
                  runError: runError instanceof Error ? runError.message : String(runError),
                },
              };
            }
          }

          return { success: true, result: { flowId: newFlowId, graph: compilation.graph } };
        }

        case 'modify_flow': {
          // Handle both formats (same as create_flow)
          const payloadObj = payload as Record<string, unknown>;
          const flowId = payloadObj.flowId as string;
          let flowPlan: unknown;

          if (payloadObj.flowPlan) {
            flowPlan = payloadObj.flowPlan;
          } else if (payloadObj.inputs || payloadObj.steps || payloadObj.loop) {
            flowPlan = payload;
          } else {
            return { success: false, error: 'No flowPlan provided in payload' };
          }

          const parseResult = parseAIResponse(JSON.stringify(flowPlan));
          if (!parseResult.success || !parseResult.plan) {
            return { success: false, error: `Invalid FlowPlan: ${parseResult.error}` };
          }

          // Build collectionPaths from folder attachments (same as create_flow)
          // Use stateRef for latest attachments
          const collectionPaths: Record<string, string> = {};
          const currentAttachments = stateRef.current.attachments;
          const folderAttachments = currentAttachments.filter(a => a.type === 'folder');
          if (folderAttachments.length > 0) {
            const firstFolderPath = folderAttachments[0].path;
            collectionPaths['folder'] = firstFolderPath;
            collectionPaths['folder_path'] = firstFolderPath;
            collectionPaths['input_folder'] = firstFolderPath;
            collectionPaths['images'] = firstFolderPath;
            collectionPaths['files'] = firstFolderPath;

            if (parseResult.plan.collections) {
              for (let i = 0; i < parseResult.plan.collections.length; i++) {
                const coll = parseResult.plan.collections[i];
                const folderPath = folderAttachments[i]?.path || firstFolderPath;
                collectionPaths[coll.name] = folderPath;
                if (coll.from) {
                  collectionPaths[coll.from] = folderPath;
                }
              }
            }

            if (parseResult.plan.inputs) {
              for (const input of parseResult.plan.inputs) {
                if (input.type === 'folder_path') {
                  collectionPaths[input.name] = firstFolderPath;
                }
              }
            }
          }

          const providerId = projectSettings?.defaultAIProvider || 'huggingface';
          const provider = AI_PROVIDERS.find(p => p.id === providerId) || AI_PROVIDERS[0];
          const compilerOptions = {
            aiModel: projectSettings?.defaultAIModel || provider.model,
            aiEndpoint: provider.endpoint,
            aiApiKeyConstant: projectSettings?.defaultAIApiKeyConstant || DEFAULT_API_KEY_CONSTANTS[providerId],
            aiRequestFormat: providerId === 'anthropic' ? 'anthropic' as const : 'openai' as const,
            aiProvider: providerId,
            collectionPaths,
          };

          const compilation = compileFlowPlan(parseResult.plan, compilerOptions);
          if (!compilation.success || !compilation.graph) {
            return { success: false, error: `Compilation failed: ${compilation.errors?.join(', ')}` };
          }

          // Post-compilation: ensure input_folder nodes have paths (same as create_flow)
          const inputFolderNodes = compilation.graph.nodes.filter(n => n.type === 'input_folder');
          if (folderAttachments.length > 0) {
            const firstFolderPath = folderAttachments[0].path;
            for (const node of inputFolderNodes) {
              if (!node.data.path || node.data.path === '') {
                logger.debug(`modify_flow: patching empty path for node ${node.id} with ${firstFolderPath}`);
                node.data.path = firstFolderPath;
              }
            }
          }

          await agentApi.updateFlowGraph(flowId, compilation.graph);

          onFlowUpdated?.(flowId, compilation.graph);

          return { success: true, result: { flowId, graph: compilation.graph } };
        }

        case 'run_flow': {
          const { flowId, inputs } = payload as { flowId: string; inputs?: Record<string, unknown> };

          const targetFlowId = flowId || stateRef.current.activeFlowId;
          if (!targetFlowId) {
            return { success: false, error: 'No flow ID specified and no active flow' };
          }

          // Start job
          const { jobId } = await agentApi.runFlow(targetFlowId, inputs);
          setState(prev => ({ ...prev, activeJobId: jobId }));

          // Wait for completion
          const jobResult = await agentApi.waitForJob(jobId, {
            timeout: 300000,
            onProgress: (job) => {
              setState(prev => ({ ...prev, activeJobId: job.id }));
            },
          });

          setState(prev => ({
            ...prev,
            lastJobOutput: jobResult.output,
            activeJobId: null,
          }));

          if (jobResult.status === 'failed') {
            return { success: false, error: jobResult.error || 'Job failed', result: jobResult };
          }

          return { success: true, result: jobResult };
        }

        case 'start_service': {
          const { serviceId } = payload as { serviceId: string };

          await agentApi.startService(serviceId);
          await agentApi.waitForServiceHealthy(serviceId, { timeout: 60000 });

          return { success: true, result: { serviceId, status: 'running' } };
        }

        case 'stop_service': {
          const { serviceId } = payload as { serviceId: string };

          await agentApi.stopService(serviceId);

          return { success: true, result: { serviceId, status: 'stopped' } };
        }

        case 'complete': {
          const { summary } = payload as { summary: string };
          return { success: true, result: { summary } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }, [projectSettings, onFlowCreated, onFlowUpdated, createFlowForAgent]);

  // Wait for user approval
  const waitForApproval = useCallback((): Promise<{ approved: boolean; reason?: string }> => {
    return new Promise((resolve) => {
      approvalResolverRef.current = (approved, reason) => {
        approvalResolverRef.current = null;
        resolve({ approved, reason });
      };
    });
  }, []);

  // Main agent loop
  const runAgentLoop = useCallback(async (goal: string, attachments: AgentAttachment[]) => {
    isRunningRef.current = true;
    // Abort any previous controller before creating a new one
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let iteration = 0;

    // Initial user message
    let initialMessage = `Goal: ${goal}`;
    if (attachments.length > 0) {
      initialMessage += `\n\nAttached resources:\n${attachments.map(a => `- ${a.type}: ${a.path}`).join('\n')}`;
    }
    conversationHistory.push({ role: 'user', content: initialMessage });

    try {
      while (iteration < configRef.current.maxIterations && isRunningRef.current) {
        iteration++;
        setState(prev => ({
          ...prev,
          status: 'planning',
          iterationCount: iteration,
        }));

        // Generate system prompt
        const systemPrompt = generateAgentSystemPrompt(moduleNodes, services, flows, attachments);

        // Get AI's next action
        const response = await callAI(systemPrompt, conversationHistory);
        conversationHistory.push({ role: 'assistant', content: response });

        const parsed = parseAgentResponse(response);
        if (!parsed) {
          setState(prev => ({
            ...prev,
            status: 'error',
            error: 'Failed to parse AI response',
          }));
          break;
        }

        // Create step
        const step: AgentStep = {
          id: `step_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          stepNumber: iteration,
          action: parsed.action,
          description: parsed.description,
          reasoning: parsed.reasoning,
          status: 'pending',
          payload: parsed.payload,
          timestamp: new Date(),
        };

        setState(prev => ({
          ...prev,
          steps: [...prev.steps, step],
          currentStep: step,
          progress: parsed.progress,
        }));

        // Handle completion
        if (parsed.action === 'complete') {
          setState(prev => ({
            ...prev,
            status: 'complete',
            progress: 100,
            steps: prev.steps.map(s =>
              s.id === step.id ? { ...s, status: 'done' } : s
            ),
          }));
          break;
        }

        // Wait for approval if needed (use ref to get latest config)
        if (configRef.current.approvalMode) {
          setState(prev => ({
            ...prev,
            status: 'waiting_approval',
            steps: prev.steps.map(s =>
              s.id === step.id ? { ...s, status: 'pending' } : s
            ),
          }));

          const { approved, reason } = await waitForApproval();

          if (!approved) {
            // Add rejection context for next iteration
            conversationHistory.push({
              role: 'user',
              content: `Action rejected${reason ? `: ${reason}` : '. Please try a different approach.'}`,
            });

            setState(prev => ({
              ...prev,
              steps: prev.steps.map(s =>
                s.id === step.id ? { ...s, status: 'skipped' } : s
              ),
            }));
            continue;
          }
        }

        // Execute action
        setState(prev => ({
          ...prev,
          status: 'executing',
          steps: prev.steps.map(s =>
            s.id === step.id ? { ...s, status: 'running' } : s
          ),
        }));

        const result = await executeAction(step);

        // Update step with result
        setState(prev => ({
          ...prev,
          steps: prev.steps.map(s =>
            s.id === step.id
              ? {
                  ...s,
                  status: result.success ? 'done' : 'failed',
                  result: result.result,
                  error: result.error,
                }
              : s
          ),
        }));

        // Add result context for next iteration
        if (result.success) {
          conversationHistory.push({
            role: 'user',
            content: `Action completed successfully. Result: ${JSON.stringify(result.result).slice(0, 1000)}`,
          });
        } else {
          conversationHistory.push({
            role: 'user',
            content: `Action failed with error: ${result.error}. Please analyze and try again.`,
          });
        }

        // Assess and iterate
        setState(prev => ({ ...prev, status: 'assessing' }));
      }

      // Max iterations reached
      if (iteration >= configRef.current.maxIterations && isRunningRef.current) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: `Maximum iterations (${configRef.current.maxIterations}) reached without completing goal`,
        }));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      isRunningRef.current = false;
    }
  }, [moduleNodes, services, flows, callAI, parseAgentResponse, executeAction, waitForApproval]);

  // Control functions
  const start = useCallback((goal: string, attachments?: AgentAttachment[]) => {
    const finalAttachments = attachments || pendingAttachments;
    logger.debug('Starting with attachments', { attachments: finalAttachments });

    const newState = {
      ...initialState,
      status: 'planning' as const,
      goal,
      attachments: finalAttachments,
    };

    // Update both state and ref immediately to avoid race condition
    // (useEffect that syncs stateRef runs after render, but we need it now)
    setState(newState);
    stateRef.current = newState;

    runAgentLoop(goal, finalAttachments);
  }, [pendingAttachments, runAgentLoop]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    abortControllerRef.current?.abort();
    approvalResolverRef.current?.(false, 'Agent stopped by user');

    setState(prev => ({
      ...prev,
      status: 'idle',
    }));
  }, []);

  const pause = useCallback(() => {
    // Pause is effectively waiting for approval
    setState(prev => ({
      ...prev,
      status: 'waiting_approval',
    }));
  }, []);

  const resume = useCallback(() => {
    if (approvalResolverRef.current) {
      approvalResolverRef.current(true);
    }
  }, []);

  const approve = useCallback(() => {
    approvalResolverRef.current?.(true);
  }, []);

  const reject = useCallback((reason?: string) => {
    approvalResolverRef.current?.(false, reason);
  }, []);

  const updateConfig = useCallback((updates: Partial<AgentConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Reset/clear the agent state
  const reset = useCallback(() => {
    // Stop if running
    isRunningRef.current = false;
    abortControllerRef.current?.abort();
    approvalResolverRef.current?.(false, 'Agent reset');

    // Reset to initial state
    setState(initialState);
  }, []);

  // Attachment management
  const addAttachment = useCallback((attachment: AgentAttachment) => {
    setPendingAttachments(prev => [...prev, attachment]);
  }, []);

  const removeAttachment = useCallback((path: string) => {
    setPendingAttachments(prev => prev.filter(a => a.path !== path));
  }, []);

  const clearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  return {
    state,
    config,
    isRunning: isRunningRef.current || state.status !== 'idle',
    pendingAttachments,

    start,
    stop,
    pause,
    resume,
    reset,

    approve,
    reject,

    updateConfig,

    addAttachment,
    removeAttachment,
    clearAttachments,
  };
}

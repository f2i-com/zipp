/**
 * Test factory helpers for creating nodes, edges, and workflows.
 */

import type { NodeInstance } from '../../module-types.js';

export interface TestNode extends NodeInstance {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface TestEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

let nodeIdCounter = 0;
let edgeIdCounter = 0;

/**
 * Reset ID counters between tests.
 */
export function resetIdCounters(): void {
  nodeIdCounter = 0;
  edgeIdCounter = 0;
}

/**
 * Create a test node with sensible defaults.
 */
export function createNode(
  type: string,
  data: Record<string, unknown> = {},
  options: { id?: string; position?: { x: number; y: number } } = {}
): TestNode {
  return {
    id: options.id ?? `node_${++nodeIdCounter}`,
    type,
    data,
    position: options.position ?? { x: 0, y: 0 },
  };
}

/**
 * Create an edge between two nodes.
 */
export function createEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  id?: string
): TestEdge {
  return {
    id: id ?? `edge_${++edgeIdCounter}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

/**
 * Create a simple linear workflow of nodes.
 */
export function createLinearWorkflow(
  nodeTypes: Array<{ type: string; data?: Record<string, unknown> }>,
  handleMapping?: { output: string; input: string }
): { nodes: TestNode[]; edges: TestEdge[] } {
  const nodes: TestNode[] = [];
  const edges: TestEdge[] = [];

  const defaultOutput = handleMapping?.output ?? 'output';
  const defaultInput = handleMapping?.input ?? 'input';

  for (let i = 0; i < nodeTypes.length; i++) {
    const node = createNode(nodeTypes[i].type, nodeTypes[i].data ?? {});
    nodes.push(node);

    if (i > 0) {
      edges.push(createEdge(nodes[i - 1].id, defaultOutput, node.id, defaultInput));
    }
  }

  return { nodes, edges };
}

/**
 * Create input text node.
 */
export function createInputTextNode(text: string, id?: string): TestNode {
  return createNode('input_text', { value: text }, { id });
}

/**
 * Create condition node.
 */
export function createConditionNode(
  operator: string,
  compareValue: unknown,
  id?: string
): TestNode {
  return createNode('condition', { operator, compareValue }, { id });
}

/**
 * Create loop start node.
 */
export function createLoopStartNode(
  mode: 'count' | 'while',
  count: number,
  id?: string
): TestNode {
  return createNode('loop_start', { mode, count }, { id });
}

/**
 * Create loop end node.
 */
export function createLoopEndNode(loopStartId: string, id?: string): TestNode {
  return createNode('loop_end', { loopStartId }, { id });
}

/**
 * Create foreach node.
 */
export function createForeachNode(id?: string): TestNode {
  return createNode('foreach', {}, { id });
}

/**
 * Create template node.
 */
export function createTemplateNode(template: string, id?: string): TestNode {
  return createNode('template', { template }, { id });
}

/**
 * Create memory operation node.
 */
export function createMemoryNode(
  operation: 'set' | 'get' | 'delete' | 'clear' | 'keys' | 'values' | 'has',
  key?: string,
  id?: string
): TestNode {
  return createNode('memory', { operation, key }, { id });
}

/**
 * Create AI LLM node.
 */
export function createAILLMNode(
  prompt: string,
  options: {
    provider?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  } = {},
  id?: string
): TestNode {
  return createNode(
    'ai_llm',
    {
      prompt,
      provider: options.provider ?? 'openai',
      model: options.model ?? 'gpt-4',
      maxTokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      systemPrompt: options.systemPrompt,
    },
    { id }
  );
}

/**
 * Create file read node.
 */
export function createFileReadNode(
  path: string,
  mode: 'text' | 'json' | 'csv' | 'base64' = 'text',
  id?: string
): TestNode {
  return createNode('file_read', { path, mode }, { id });
}

/**
 * Create file write node.
 */
export function createFileWriteNode(
  path: string,
  content: string,
  id?: string
): TestNode {
  return createNode('file_write', { path, content }, { id });
}

/**
 * Create browser fetch node.
 */
export function createBrowserFetchNode(
  url: string,
  options: { method?: string; extractionMethod?: string } = {},
  id?: string
): TestNode {
  return createNode(
    'browser_fetch',
    {
      url,
      method: options.method ?? 'GET',
      extractionMethod: options.extractionMethod ?? 'html',
    },
    { id }
  );
}

/**
 * Create database store node.
 */
export function createDatabaseStoreNode(
  collection: string,
  id?: string
): TestNode {
  return createNode('database_store', { collection }, { id });
}

/**
 * Create database query node.
 */
export function createDatabaseQueryNode(
  collection: string,
  filter?: Record<string, unknown>,
  id?: string
): TestNode {
  return createNode('database_query', { collection, filter }, { id });
}

/**
 * Create image generate node.
 */
export function createImageGenerateNode(
  prompt: string,
  options: { provider?: string; width?: number; height?: number } = {},
  id?: string
): TestNode {
  return createNode(
    'image_generate',
    {
      prompt,
      provider: options.provider ?? 'openai',
      width: options.width ?? 1024,
      height: options.height ?? 1024,
    },
    { id }
  );
}

/**
 * Create terminal session node.
 */
export function createTerminalSessionNode(
  shell?: string,
  id?: string
): TestNode {
  return createNode('terminal_session', { shell }, { id });
}

/**
 * Create terminal command node.
 */
export function createTerminalCommandNode(
  command: string,
  id?: string
): TestNode {
  return createNode('terminal_command', { command }, { id });
}

/**
 * Create macro call node.
 */
export function createMacroCallNode(
  macroId: string,
  inputMapping?: Record<string, string>,
  id?: string
): TestNode {
  return createNode('macro_call', { macroId, inputMapping }, { id });
}

/**
 * Create subflow node.
 */
export function createSubflowNode(
  flowId: string,
  inputMapping?: Record<string, string>,
  id?: string
): TestNode {
  return createNode('subflow', { flowId, inputMapping }, { id });
}

/**
 * Create vectorize node.
 */
export function createVectorizeNode(
  quality: 'low' | 'medium' | 'high' = 'medium',
  colorCount?: number,
  id?: string
): TestNode {
  return createNode('vectorize', { quality, colorCount }, { id });
}

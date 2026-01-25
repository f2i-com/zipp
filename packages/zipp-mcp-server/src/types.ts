/**
 * Type definitions for Zipp MCP Server
 */

// ============================================
// Workflow Types
// ============================================

export interface Flow {
  id: string;
  name: string;
  description?: string;
  graph?: WorkflowGraph;
  isMacro?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// ============================================
// Job/Execution Types
// ============================================

export interface Job {
  id: string;
  flowId: string;
  flowName?: string;
  status: JobStatus;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  nodeOutputs?: Record<string, unknown>;
  error?: string;
  logs?: JobLog[];
  createdAt?: string;
  submittedAt?: number;
  startedAt?: number;
  completedAt?: number;
  position?: number;
  priority?: number;
  // Claude-as-AI yield information
  aiRequest?: AIYieldRequest;
}

export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'awaiting_ai';  // New status for Claude-as-AI pattern

export interface JobLog {
  id: string;
  timestamp: number;
  type: 'info' | 'error' | 'success' | 'node' | 'output';
  source: string;
  message: string;
}

// ============================================
// Claude-as-AI Types
// ============================================

export interface AIYieldRequest {
  continueToken: string;
  jobId: string;
  nodeId: string;
  nodeType: string;
  prompt: string;
  systemPrompt?: string;
  image?: string;  // Base64 encoded image for vision tasks
  context?: Record<string, unknown>;  // Additional context from workflow
}

export interface PendingAIRequest {
  token: string;
  jobId: string;
  nodeId: string;
  request: AIYieldRequest;
  createdAt: number;
}

// ============================================
// Node/Module Types
// ============================================

export interface NodeDefinition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tags?: string[];
  inputs?: NodePort[];
  outputs?: NodePort[];
  properties?: NodeProperty[];
}

export interface NodePort {
  id: string;
  name: string;
  type: string;
  required?: boolean;
}

export interface NodeProperty {
  id: string;
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
}

export interface Module {
  id: string;
  name: string;
  version: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  nodes: string[];
}

// ============================================
// FlowPlan Types (AI-friendly DSL)
// ============================================

export interface FlowPlan {
  name: string;
  description: string;
  inputs?: FlowPlanInput[];
  collections?: FlowPlanCollection[];
  loop?: FlowPlanLoop;
  steps?: FlowPlanStep[];
}

export interface FlowPlanInput {
  name: string;
  type: 'text' | 'folder_path' | 'file_path' | 'number' | 'url';
  description: string;
  default?: string;
}

export interface FlowPlanCollection {
  name: string;
  type: 'folder_files';
  from: string;
  include?: string[];
  exclude?: string[];
  recursive?: boolean;
  max?: number;
}

export interface FlowPlanLoop {
  mode: 'for_each' | 'count' | 'while';
  over: string;
  itemAlias: string;
  steps: FlowPlanStep[];
}

export type FlowPlanStep = Record<string, unknown> & {
  id: string;
  type: string;
};

// ============================================
// Service Types
// ============================================

export interface ServiceInfo {
  id: string;
  name: string;
  description: string;
  port: number;
  icon: string;
  color: string;
  path: string;
  installed: boolean;
}

export interface ServiceStatus {
  id: string;
  running: boolean;
  healthy: boolean;
  port: number;
}

export interface ServiceOutput {
  service_id: string;
  lines: string[];
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface RunWorkflowResult {
  jobId: string;
  status: JobStatus;
  // If workflow yielded for AI input
  aiRequest?: AIYieldRequest;
  // If workflow completed
  outputs?: Record<string, unknown>;
  error?: string;
}

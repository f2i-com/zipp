/**
 * Agent API Client
 *
 * Wrapper functions for the agent to interact with Zipp's REST API.
 * Uses existing endpoints for flows, jobs, and services.
 */

import type { WorkflowGraph } from 'zipp-core';

// API base URL - uses the app's API server
const API_BASE = 'http://127.0.0.1:3000';

// Response wrapper type matching api_server.rs
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Flow types
export interface FlowInfo {
  id: string;
  name: string;
  description?: string;
}

export interface FlowDetail extends FlowInfo {
  graph?: WorkflowGraph;
  isMacro?: boolean;
  isBuiltIn?: boolean;
}

// Job types
export interface JobInfo {
  id: string;
  flowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  createdAt: string;
}

export interface JobResult extends JobInfo {
  output?: unknown;
  error?: string;
  completedAt?: string;
  logs?: string[];
}

// Service types
export interface ServiceInfo {
  id: string;
  name: string;
  description?: string;
  category?: string;
  running: boolean;
  healthy?: boolean;
  port?: number;
}

/**
 * Generic fetch helper with error handling
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const json: ApiResponse<T> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Unknown API error');
  }

  return json.data as T;
}

// ============================================================================
// Flow Operations
// ============================================================================

/**
 * List all available flows
 */
export async function listFlows(): Promise<FlowInfo[]> {
  return apiFetch<FlowInfo[]>('/api/flows');
}

/**
 * Get a single flow by ID
 */
export async function getFlow(flowId: string): Promise<FlowDetail> {
  return apiFetch<FlowDetail>(`/api/flows/${flowId}`);
}

/**
 * Create a new flow
 */
export async function createFlow(name: string): Promise<FlowInfo> {
  return apiFetch<FlowInfo>('/api/flows', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/**
 * Update a flow's metadata (name, description)
 */
export async function updateFlow(
  flowId: string,
  updates: { name?: string; description?: string }
): Promise<FlowInfo> {
  return apiFetch<FlowInfo>(`/api/flows/${flowId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * Update a flow's graph (nodes and edges)
 */
export async function updateFlowGraph(
  flowId: string,
  graph: WorkflowGraph
): Promise<void> {
  await apiFetch<void>(`/api/flows/${flowId}/graph`, {
    method: 'PUT',
    body: JSON.stringify({ graph }),
  });
}

/**
 * Delete a flow
 */
export async function deleteFlow(flowId: string): Promise<void> {
  await apiFetch<void>(`/api/flows/${flowId}`, {
    method: 'DELETE',
  });
}

/**
 * Validate a flow before execution
 */
export async function validateFlow(flowId: string): Promise<{
  valid: boolean;
  errors?: string[];
}> {
  return apiFetch(`/api/flows/${flowId}/validate`, {
    method: 'POST',
  });
}

// ============================================================================
// Job Operations
// ============================================================================

/**
 * Run a flow (create a job)
 */
export async function runFlow(
  flowId: string,
  inputs?: Record<string, unknown>
): Promise<{ jobId: string }> {
  // API returns { jobId, status, position } - use jobId directly
  const result = await apiFetch<{ jobId: string; status: string; position: number }>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ flowId, inputs }),
  });
  return { jobId: result.jobId };
}

/**
 * Get job status and result
 */
export async function getJob(jobId: string): Promise<JobResult> {
  // API returns 'jobError' instead of 'error' to avoid API server treating as error response
  const result = await apiFetch<JobResult & { jobError?: string }>(`/api/jobs/${jobId}`);
  // Map jobError back to error for convenience
  if (result.jobError && !result.error) {
    result.error = result.jobError;
  }
  return result;
}

/**
 * Wait for a job to complete (polling)
 */
export async function waitForJob(
  jobId: string,
  options: {
    timeout?: number;       // Max wait time in ms (default: 5 min)
    pollInterval?: number;  // Poll interval in ms (default: 1s)
    onProgress?: (job: JobResult) => void;
  } = {}
): Promise<JobResult> {
  const { timeout = 300000, pollInterval = 1000, onProgress } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = await getJob(jobId);

    if (onProgress) {
      onProgress(job);
    }

    if (['completed', 'failed', 'aborted'].includes(job.status)) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job ${jobId} timed out after ${timeout}ms`);
}

/**
 * Abort a running job
 */
export async function abortJob(jobId: string): Promise<void> {
  await apiFetch<void>(`/api/jobs/${jobId}/abort`, {
    method: 'POST',
  });
}

// ============================================================================
// Service Operations
// ============================================================================

/**
 * List all available services
 */
export async function listServices(): Promise<ServiceInfo[]> {
  return apiFetch<ServiceInfo[]>('/api/services');
}

/**
 * Get status of a specific service
 */
export async function getServiceStatus(serviceId: string): Promise<ServiceInfo> {
  return apiFetch<ServiceInfo>(`/api/services/${serviceId}`);
}

/**
 * Start a service
 */
export async function startService(
  serviceId: string,
  envVars?: Record<string, string>
): Promise<ServiceInfo> {
  return apiFetch<ServiceInfo>(`/api/services/${serviceId}/start`, {
    method: 'POST',
    body: JSON.stringify({ envVars }),
  });
}

/**
 * Stop a service
 */
export async function stopService(serviceId: string): Promise<void> {
  await apiFetch<void>(`/api/services/${serviceId}/stop`, {
    method: 'POST',
  });
}

/**
 * Get the port a running service is listening on
 */
export async function getServicePort(serviceId: string): Promise<number | null> {
  try {
    const result = await apiFetch<{ port: number | null }>(`/api/services/${serviceId}/port`);
    return result.port;
  } catch {
    return null;
  }
}

/**
 * Wait for a service to become healthy
 */
export async function waitForServiceHealthy(
  serviceId: string,
  options: {
    timeout?: number;
    pollInterval?: number;
  } = {}
): Promise<ServiceInfo> {
  const { timeout = 60000, pollInterval = 1000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getServiceStatus(serviceId);

    if (status.running && status.healthy) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Service ${serviceId} did not become healthy within ${timeout}ms`);
}

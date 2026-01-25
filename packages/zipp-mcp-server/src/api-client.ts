/**
 * Zipp HTTP API Client
 *
 * Wrapper around Zipp's REST API for workflow management and execution.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  Flow,
  WorkflowGraph,
  Job,
  JobLog,
  NodeDefinition,
  Module,
  ApiResponse,
  ServiceInfo,
  ServiceStatus,
  ServiceOutput,
} from './types.js';

export interface ZippApiClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export class ZippApiClient {
  private client: AxiosInstance;

  constructor(options: ZippApiClientOptions = {}) {
    const baseUrl = options.baseUrl || process.env.ZIPP_API_URL || 'http://localhost:3000';
    const apiKey = options.apiKey || process.env.ZIPP_API_KEY;

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
    });
  }

  // ============================================
  // Health Check
  // ============================================

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // ============================================
  // Flow/Workflow Management
  // ============================================

  async listFlows(): Promise<Flow[]> {
    const response = await this.client.get<ApiResponse<Flow[]>>('/api/flows');
    return response.data.data || [];
  }

  async getFlow(flowId: string): Promise<Flow | null> {
    try {
      const response = await this.client.get<ApiResponse<Flow>>(`/api/flows/${flowId}`);
      return response.data.data || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createFlow(name: string, description?: string): Promise<Flow> {
    const response = await this.client.post<ApiResponse<Flow>>('/api/flows', {
      name,
      description,
    });
    if (!response.data.data) {
      throw new Error('Failed to create flow');
    }
    return response.data.data;
  }

  async updateFlow(flowId: string, updates: Partial<Flow>): Promise<Flow> {
    const response = await this.client.patch<ApiResponse<Flow>>(`/api/flows/${flowId}`, updates);
    if (!response.data.data) {
      throw new Error('Failed to update flow');
    }
    return response.data.data;
  }

  async deleteFlow(flowId: string): Promise<void> {
    await this.client.delete(`/api/flows/${flowId}`);
  }

  async getFlowGraph(flowId: string): Promise<WorkflowGraph | null> {
    const flow = await this.getFlow(flowId);
    return flow?.graph || null;
  }

  async updateFlowGraph(flowId: string, graph: WorkflowGraph): Promise<void> {
    await this.client.put(`/api/flows/${flowId}/graph`, { graph });
  }

  // ============================================
  // Job/Execution Management
  // ============================================

  async createJob(flowId: string, inputs?: Record<string, unknown>): Promise<Job> {
    const response = await this.client.post<ApiResponse<Job>>('/api/jobs', {
      flowId,
      inputs,
    });
    if (!response.data.data) {
      throw new Error('Failed to create job');
    }
    return response.data.data;
  }

  async listJobs(status?: string, limit?: number): Promise<Job[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (limit) params.set('limit', limit.toString());

    const response = await this.client.get<ApiResponse<Job[]>>(`/api/jobs?${params}`);
    return response.data.data || [];
  }

  async getJob(jobId: string): Promise<Job | null> {
    try {
      const response = await this.client.get<ApiResponse<Job>>(`/api/jobs/${jobId}`);
      return response.data.data || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async abortJob(jobId: string): Promise<void> {
    await this.client.delete(`/api/jobs/${jobId}`);
  }

  async getJobLogs(jobId: string, limit?: number): Promise<JobLog[]> {
    const params = limit ? `?limit=${limit}` : '';
    const response = await this.client.get<ApiResponse<JobLog[]>>(`/api/jobs/${jobId}/logs${params}`);
    return response.data.data || [];
  }

  // ============================================
  // Node/Module Introspection
  // ============================================

  async listNodes(): Promise<NodeDefinition[]> {
    const response = await this.client.get<ApiResponse<NodeDefinition[]>>('/api/nodes');
    return response.data.data || [];
  }

  async getNodeDefinition(nodeType: string): Promise<NodeDefinition | null> {
    try {
      const response = await this.client.get<ApiResponse<NodeDefinition>>(`/api/nodes/${nodeType}`);
      return response.data.data || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async listModules(): Promise<Module[]> {
    const response = await this.client.get<ApiResponse<Module[]>>('/api/modules');
    return response.data.data || [];
  }

  // ============================================
  // Validation
  // ============================================

  async validateFlow(flowId: string): Promise<{ valid: boolean; errors: string[]; warnings?: string[] }> {
    const response = await this.client.post<ApiResponse<{ valid: boolean; errors: string[]; warnings?: string[] }>>(
      `/api/flows/${flowId}/validate`
    );
    return response.data.data || { valid: false, errors: ['Unknown error'] };
  }

  // ============================================
  // Claude-as-AI Workflow Execution
  // ============================================

  /**
   * Run a workflow with optional Claude-as-AI mode.
   * In this mode, AI nodes will yield control back to Claude for completion.
   */
  async runWorkflow(
    flowId: string,
    options?: {
      inputs?: Record<string, unknown>;
      useClaudeForAI?: boolean;
    }
  ): Promise<Job> {
    const response = await this.client.post<ApiResponse<Job>>('/api/jobs', {
      flowId,
      inputs: options?.inputs,
      useClaudeForAI: options?.useClaudeForAI ?? false,
    });
    if (!response.data.data) {
      throw new Error('Failed to run workflow');
    }
    return response.data.data;
  }

  /**
   * Continue a workflow that yielded for AI input.
   */
  async continueWorkflow(continueToken: string, response: string): Promise<Job> {
    const apiResponse = await this.client.post<ApiResponse<Job>>('/api/jobs/continue', {
      continueToken,
      response,
    });
    if (!apiResponse.data.data) {
      throw new Error('Failed to continue workflow');
    }
    return apiResponse.data.data;
  }

  // ============================================
  // Service Management
  // ============================================

  async listServices(): Promise<ServiceInfo[]> {
    const response = await this.client.get<ApiResponse<ServiceInfo[]>>('/api/services');
    return response.data.data || [];
  }

  async getServiceStatus(serviceId: string): Promise<ServiceStatus | null> {
    try {
      const response = await this.client.get<ApiResponse<ServiceStatus>>(`/api/services/${serviceId}`);
      return response.data.data || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async startService(serviceId: string, envVars?: Record<string, string>): Promise<ServiceStatus> {
    const response = await this.client.post<ApiResponse<ServiceStatus>>(`/api/services/${serviceId}/start`, {
      envVars,
    });
    if (!response.data.data) {
      throw new Error('Failed to start service');
    }
    return response.data.data;
  }

  async stopService(serviceId: string): Promise<ServiceStatus> {
    const response = await this.client.post<ApiResponse<ServiceStatus>>(`/api/services/${serviceId}/stop`);
    if (!response.data.data) {
      throw new Error('Failed to stop service');
    }
    return response.data.data;
  }

  async getServiceOutput(serviceId: string, limit?: number): Promise<ServiceOutput> {
    const params = limit ? `?limit=${limit}` : '';
    const response = await this.client.get<ApiResponse<ServiceOutput>>(`/api/services/${serviceId}/output${params}`);
    return response.data.data || { service_id: serviceId, lines: [] };
  }

  async clearServiceOutput(serviceId: string): Promise<void> {
    await this.client.delete(`/api/services/${serviceId}/output`);
  }

  // ============================================
  // Error Handling Helper
  // ============================================

  static formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>;
      if (axiosError.response?.data) {
        return axiosError.response.data.error || axiosError.response.data.message || axiosError.message;
      }
      if (axiosError.code === 'ECONNREFUSED') {
        return 'Cannot connect to Zipp. Make sure the Zipp desktop app is running.';
      }
      return axiosError.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

// Singleton instance
let clientInstance: ZippApiClient | null = null;

export function getApiClient(options?: ZippApiClientOptions): ZippApiClient {
  if (!clientInstance || options) {
    clientInstance = new ZippApiClient(options);
  }
  return clientInstance;
}

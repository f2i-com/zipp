/**
 * Zipp MCP Server Implementation
 *
 * Exposes Zipp workflow capabilities to Claude via the Model Context Protocol.
 * Supports the "Claude-as-AI" pattern where Claude can substitute for AI nodes.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { getApiClient, ZippApiClient } from './api-client.js';
import { randomUUID } from 'crypto';
import type {
  Flow,
  WorkflowGraph,
  Job,
  NodeDefinition,
  FlowPlan,
  AIYieldRequest,
} from './types.js';

// ============================================
// Validation Helpers
// ============================================

/**
 * Validates that a string parameter is non-empty
 */
function validateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required and must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Validates an optional string parameter
 */
function validateOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string if provided`);
  }
  return value.trim() || undefined;
}

/**
 * Validates a number parameter with optional bounds
 */
function validateNumber(value: unknown, fieldName: string, min?: number, max?: number): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new Error(`${fieldName} must be at most ${max}`);
  }
  return value;
}

/**
 * Validates an optional number parameter
 */
function validateOptionalNumber(value: unknown, fieldName: string, min?: number, max?: number): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return validateNumber(value, fieldName, min, max);
}

/**
 * Creates an error response for a tool
 */
function toolError(toolName: string, message: string) {
  return {
    content: [{ type: 'text' as const, text: `[${toolName}] Error: ${message}` }],
    isError: true,
  };
}

/**
 * Creates a success response for a tool
 */
function toolSuccess(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

/**
 * Creates a JSON success response for a tool
 */
function toolJson(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ============================================
// Tool Definitions
// ============================================

const tools: Tool[] = [
  // --- Workflow Management ---
  {
    name: 'list_workflows',
    description: 'List all available workflows in Zipp. Returns flow IDs, names, and descriptions.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Optional filter string to search workflow names',
        },
      },
    },
  },
  {
    name: 'get_workflow',
    description: 'Get detailed information about a specific workflow, including its graph structure.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The ID of the workflow to retrieve',
        },
      },
      required: ['flowId'],
    },
  },
  {
    name: 'create_workflow',
    description: 'Create a new empty workflow in Zipp.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new workflow',
        },
        description: {
          type: 'string',
          description: 'Optional description of what the workflow does',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_workflow',
    description: 'Delete a workflow from Zipp.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The ID of the workflow to delete',
        },
      },
      required: ['flowId'],
    },
  },

  // --- Node Operations ---
  {
    name: 'add_node',
    description: 'Add a new node to a workflow. Use list_available_nodes to see available node types.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow to add the node to',
        },
        nodeType: {
          type: 'string',
          description: 'The type of node to add (e.g., "ai_llm", "file_read", "template")',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          description: 'Optional position for the node on the canvas',
        },
        data: {
          type: 'object',
          description: 'Optional initial configuration data for the node',
        },
      },
      required: ['flowId', 'nodeType'],
    },
  },
  {
    name: 'update_node',
    description: 'Update the configuration of an existing node.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow containing the node',
        },
        nodeId: {
          type: 'string',
          description: 'The ID of the node to update',
        },
        data: {
          type: 'object',
          description: 'New configuration data for the node',
        },
      },
      required: ['flowId', 'nodeId', 'data'],
    },
  },
  {
    name: 'delete_node',
    description: 'Remove a node from a workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow containing the node',
        },
        nodeId: {
          type: 'string',
          description: 'The ID of the node to delete',
        },
      },
      required: ['flowId', 'nodeId'],
    },
  },
  {
    name: 'connect_nodes',
    description: 'Create a connection (edge) between two nodes in a workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow containing the nodes',
        },
        sourceId: {
          type: 'string',
          description: 'The ID of the source node',
        },
        targetId: {
          type: 'string',
          description: 'The ID of the target node',
        },
        sourceHandle: {
          type: 'string',
          description: 'The output handle on the source node (e.g., "response", "output")',
        },
        targetHandle: {
          type: 'string',
          description: 'The input handle on the target node (e.g., "prompt", "input")',
        },
      },
      required: ['flowId', 'sourceId', 'targetId'],
    },
  },
  {
    name: 'disconnect_nodes',
    description: 'Remove a connection between nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow containing the edge',
        },
        edgeId: {
          type: 'string',
          description: 'The ID of the edge to remove',
        },
      },
      required: ['flowId', 'edgeId'],
    },
  },

  // --- Execution ---
  {
    name: 'run_workflow',
    description: 'Execute a workflow. Set useClaudeForAI=true to have Claude handle AI node completions instead of external APIs.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The ID of the workflow to run',
        },
        inputs: {
          type: 'object',
          description: 'Optional input values for the workflow',
        },
        useClaudeForAI: {
          type: 'boolean',
          description: 'If true, AI nodes will yield to Claude for completion instead of calling external APIs',
        },
      },
      required: ['flowId'],
    },
  },
  {
    name: 'continue_workflow',
    description: 'Continue a workflow that has yielded for AI input. Provide your response for the AI node.',
    inputSchema: {
      type: 'object',
      properties: {
        continueToken: {
          type: 'string',
          description: 'The continue token from the yielded workflow',
        },
        response: {
          type: 'string',
          description: 'Your response for the AI node',
        },
      },
      required: ['continueToken', 'response'],
    },
  },
  {
    name: 'stop_workflow',
    description: 'Abort a running workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job ID of the running workflow',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'get_job_status',
    description: 'Get the current status of a workflow execution.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job ID to check',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'get_job_logs',
    description: 'Get execution logs from a workflow run.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job ID to get logs for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log entries to return',
        },
      },
      required: ['jobId'],
    },
  },

  // --- FlowPlan (AI-Friendly) ---
  {
    name: 'create_workflow_from_description',
    description: 'Create a workflow from a natural language description. The workflow will be generated and ready to run.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of what the workflow should do',
        },
        name: {
          type: 'string',
          description: 'Optional name for the workflow',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'get_workflow_as_flowplan',
    description: 'Get a workflow in FlowPlan DSL format, which is easier to understand and modify.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow to convert',
        },
      },
      required: ['flowId'],
    },
  },
  {
    name: 'apply_flowplan',
    description: 'Apply a FlowPlan to a workflow, replacing its current graph.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow to update',
        },
        flowPlan: {
          type: 'object',
          description: 'The FlowPlan DSL object to apply',
        },
      },
      required: ['flowId', 'flowPlan'],
    },
  },

  // --- Introspection ---
  {
    name: 'list_available_nodes',
    description: 'List all available node types that can be added to workflows.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_node_definition',
    description: 'Get detailed information about a node type, including its inputs, outputs, and configuration options.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to get information about',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'list_modules',
    description: 'List all loaded modules and their capabilities.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'validate_workflow',
    description: 'Check a workflow for errors before running it.',
    inputSchema: {
      type: 'object',
      properties: {
        flowId: {
          type: 'string',
          description: 'The workflow to validate',
        },
      },
      required: ['flowId'],
    },
  },

  // --- Service Management ---
  {
    name: 'list_services',
    description: 'List all available services that can be started. Services provide additional functionality like video downloading, speech-to-text, etc.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_service_status',
    description: 'Get the current status of a service (running, healthy, port).',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The ID of the service to check',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'start_service',
    description: 'Start a service. Services typically need to be running before they can be used by workflow nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The ID of the service to start',
        },
        envVars: {
          type: 'object',
          description: 'Optional environment variables to pass to the service',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'stop_service',
    description: 'Stop a running service.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The ID of the service to stop',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'get_service_output',
    description: 'Get the output logs from a service (stdout/stderr).',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The ID of the service',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log lines to return',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'clear_service_output',
    description: 'Clear the output logs for a service.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The ID of the service',
        },
      },
      required: ['serviceId'],
    },
  },
];

// ============================================
// Server Implementation
// ============================================

export function createServer(): Server {
  const server = new Server(
    {
      name: 'zipp-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  const api = getApiClient();

  // --- List Tools Handler ---
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // --- Call Tool Handler ---
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // === Workflow Management ===
        case 'list_workflows': {
          const flows = await api.listFlows();
          const filter = (args as { filter?: string })?.filter?.toLowerCase();
          const filtered = filter
            ? flows.filter(f => f.name.toLowerCase().includes(filter))
            : flows;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  filtered.map(f => ({
                    id: f.id,
                    name: f.name,
                    description: f.description,
                    isMacro: f.isMacro,
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'get_workflow': {
          const flowId = validateString((args as Record<string, unknown>).flowId, 'flowId');
          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('get_workflow', `Workflow "${flowId}" not found`);
          }
          return toolJson(flow);
        }

        case 'create_workflow': {
          const name = validateString((args as Record<string, unknown>).name, 'name');
          const description = validateOptionalString((args as Record<string, unknown>).description, 'description');
          const flow = await api.createFlow(name, description);
          return toolSuccess(`Created workflow "${flow.name}" with ID: ${flow.id}`);
        }

        case 'delete_workflow': {
          const flowId = validateString((args as Record<string, unknown>).flowId, 'flowId');
          // Verify the workflow exists first
          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('delete_workflow', `Workflow "${flowId}" not found`);
          }
          await api.deleteFlow(flowId);
          return toolSuccess(`Deleted workflow "${flowId}"`);
        }

        // === Node Operations ===
        case 'add_node': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');
          const nodeType = validateString(params.nodeType, 'nodeType');
          const position = params.position as { x: number; y: number } | undefined;
          const data = params.data as Record<string, unknown> | undefined;

          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('add_node', `Workflow "${flowId}" not found`);
          }
          if (!flow.graph) {
            return toolError('add_node', `Workflow "${flowId}" has no graph`);
          }

          // Validate position if provided
          if (position) {
            if (typeof position.x !== 'number' || typeof position.y !== 'number') {
              return toolError('add_node', 'Position must have numeric x and y values');
            }
          }

          // Generate a unique node ID using UUID
          const nodeId = `${nodeType}_${randomUUID().substring(0, 8)}`;
          const newNode = {
            id: nodeId,
            type: nodeType,
            position: position || { x: 100, y: 100 },
            data: data || {},
          };
          flow.graph.nodes.push(newNode);
          await api.updateFlowGraph(flowId, flow.graph);
          return toolSuccess(`Added node "${nodeId}" of type "${nodeType}" to workflow`);
        }

        case 'update_node': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');
          const nodeId = validateString(params.nodeId, 'nodeId');
          const data = params.data as Record<string, unknown>;

          if (!data || typeof data !== 'object') {
            return toolError('update_node', 'data must be an object');
          }

          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('update_node', `Workflow "${flowId}" not found`);
          }
          if (!flow.graph) {
            return toolError('update_node', `Workflow "${flowId}" has no graph`);
          }

          const node = flow.graph.nodes.find(n => n.id === nodeId);
          if (!node) {
            return toolError('update_node', `Node "${nodeId}" not found in workflow`);
          }

          node.data = { ...node.data, ...data };
          await api.updateFlowGraph(flowId, flow.graph);
          return toolSuccess(`Updated node "${nodeId}"`);
        }

        case 'delete_node': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');
          const nodeId = validateString(params.nodeId, 'nodeId');

          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('delete_node', `Workflow "${flowId}" not found`);
          }
          if (!flow.graph) {
            return toolError('delete_node', `Workflow "${flowId}" has no graph`);
          }

          // Check if node exists
          const nodeExists = flow.graph.nodes.some(n => n.id === nodeId);
          if (!nodeExists) {
            return toolError('delete_node', `Node "${nodeId}" not found in workflow`);
          }

          const edgesRemoved = flow.graph.edges.filter(
            e => e.source === nodeId || e.target === nodeId
          ).length;

          flow.graph.nodes = flow.graph.nodes.filter(n => n.id !== nodeId);
          flow.graph.edges = flow.graph.edges.filter(
            e => e.source !== nodeId && e.target !== nodeId
          );
          await api.updateFlowGraph(flowId, flow.graph);
          return toolSuccess(`Deleted node "${nodeId}" and ${edgesRemoved} connection(s)`);
        }

        case 'connect_nodes': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');
          const sourceId = validateString(params.sourceId, 'sourceId');
          const targetId = validateString(params.targetId, 'targetId');
          const sourceHandle = validateOptionalString(params.sourceHandle, 'sourceHandle');
          const targetHandle = validateOptionalString(params.targetHandle, 'targetHandle');

          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('connect_nodes', `Workflow "${flowId}" not found`);
          }
          if (!flow.graph) {
            return toolError('connect_nodes', `Workflow "${flowId}" has no graph`);
          }

          // Check if source and target nodes exist
          const sourceNode = flow.graph.nodes.find(n => n.id === sourceId);
          const targetNode = flow.graph.nodes.find(n => n.id === targetId);
          if (!sourceNode) {
            return toolError('connect_nodes', `Source node "${sourceId}" not found`);
          }
          if (!targetNode) {
            return toolError('connect_nodes', `Target node "${targetId}" not found`);
          }

          // Prevent self-loops
          if (sourceId === targetId) {
            return toolError('connect_nodes', 'Cannot connect a node to itself');
          }

          // Check for duplicate edge (same source, target, and handles)
          const duplicateEdge = flow.graph.edges.find(e =>
            e.source === sourceId &&
            e.target === targetId &&
            e.sourceHandle === sourceHandle &&
            e.targetHandle === targetHandle
          );
          if (duplicateEdge) {
            return toolError('connect_nodes', `Connection already exists between "${sourceId}" and "${targetId}"`);
          }

          const edgeId = `edge_${sourceId}_${targetId}_${randomUUID().substring(0, 8)}`;
          flow.graph.edges.push({
            id: edgeId,
            source: sourceId,
            target: targetId,
            sourceHandle,
            targetHandle,
          });
          await api.updateFlowGraph(flowId, flow.graph);
          return toolSuccess(`Connected "${sourceId}" → "${targetId}" (edge: ${edgeId})`);
        }

        case 'disconnect_nodes': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');
          const edgeId = validateString(params.edgeId, 'edgeId');

          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('disconnect_nodes', `Workflow "${flowId}" not found`);
          }
          if (!flow.graph) {
            return toolError('disconnect_nodes', `Workflow "${flowId}" has no graph`);
          }

          // Check if edge exists
          const edgeExists = flow.graph.edges.some(e => e.id === edgeId);
          if (!edgeExists) {
            return toolError('disconnect_nodes', `Edge "${edgeId}" not found`);
          }

          flow.graph.edges = flow.graph.edges.filter(e => e.id !== edgeId);
          await api.updateFlowGraph(flowId, flow.graph);
          return toolSuccess(`Removed connection "${edgeId}"`);
        }

        // === Execution ===
        case 'run_workflow': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');
          const inputs = params.inputs as Record<string, unknown> | undefined;
          const useClaudeForAI = params.useClaudeForAI as boolean | undefined;

          // Verify workflow exists before trying to run it
          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('run_workflow', `Workflow "${flowId}" not found`);
          }

          const job = await api.runWorkflow(flowId, { inputs, useClaudeForAI });

          // Check if workflow yielded for AI input
          if (job.status === 'awaiting_ai') {
            return toolJson({
              status: 'awaiting_ai',
              message: 'Workflow has paused at an AI node and needs your input. Use continue_workflow to provide a response.',
              jobId: job.id,
              flowId: job.flowId,
              flowName: job.flowName,
              aiRequest: job.aiRequest,
            });
          }

          return toolJson({
            jobId: job.id,
            status: job.status,
            flowId: job.flowId,
            flowName: job.flowName,
            message: `Workflow started. Use get_job_status("${job.id}") to check progress.`,
          });
        }

        case 'continue_workflow': {
          const params = args as Record<string, unknown>;
          const continueToken = validateString(params.continueToken, 'continueToken');
          const response = validateString(params.response, 'response');

          const job = await api.continueWorkflow(continueToken, response);

          // Check if there's another AI yield
          if (job.status === 'awaiting_ai') {
            return toolJson({
              status: 'awaiting_ai',
              message: 'Workflow needs another AI response.',
              jobId: job.id,
              aiRequest: job.aiRequest,
            });
          }

          return toolJson({
            jobId: job.id,
            status: job.status,
            outputs: job.outputs,
            message: job.status === 'completed' ? 'Workflow completed successfully' : `Workflow status: ${job.status}`,
          });
        }

        case 'stop_workflow': {
          const params = args as Record<string, unknown>;
          const jobId = validateString(params.jobId, 'jobId');

          // Verify job exists
          const job = await api.getJob(jobId);
          if (!job) {
            return toolError('stop_workflow', `Job "${jobId}" not found`);
          }
          if (job.status === 'completed' || job.status === 'failed' || job.status === 'aborted') {
            return toolError('stop_workflow', `Job "${jobId}" has already finished with status: ${job.status}`);
          }

          await api.abortJob(jobId);
          return toolSuccess(`Stopped workflow job "${jobId}"`);
        }

        case 'get_job_status': {
          const params = args as Record<string, unknown>;
          const jobId = validateString(params.jobId, 'jobId');

          const job = await api.getJob(jobId);
          if (!job) {
            return toolError('get_job_status', `Job "${jobId}" not found`);
          }
          return toolJson(job);
        }

        case 'get_job_logs': {
          const params = args as Record<string, unknown>;
          const jobId = validateString(params.jobId, 'jobId');
          const limit = validateOptionalNumber(params.limit, 'limit', 1, 1000);

          // Verify job exists
          const job = await api.getJob(jobId);
          if (!job) {
            return toolError('get_job_logs', `Job "${jobId}" not found`);
          }

          const logs = await api.getJobLogs(jobId, limit);
          return toolJson({
            jobId,
            count: logs.length,
            logs,
          });
        }

        // === FlowPlan ===
        case 'create_workflow_from_description': {
          const params = args as Record<string, unknown>;
          const description = validateString(params.description, 'description');
          const workflowName = validateOptionalString(params.name, 'name');

          // For now, return guidance. Full implementation needs zipp-core FlowPlan compiler.
          return toolSuccess(`To create a workflow from description, you can:
1. Use create_workflow() to create an empty workflow
2. Use list_available_nodes() to see available node types
3. Use add_node() to add nodes based on the description
4. Use connect_nodes() to wire them together

Description: "${description}"
${workflowName ? `Suggested name: "${workflowName}"` : ''}

Alternatively, build a FlowPlan JSON and use apply_flowplan().`);
        }

        case 'get_workflow_as_flowplan': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');

          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('get_workflow_as_flowplan', `Workflow "${flowId}" not found`);
          }
          if (!flow.graph) {
            return toolError('get_workflow_as_flowplan', `Workflow "${flowId}" has no graph`);
          }

          // For now, return the graph. Full implementation needs decompileFlowPlan from zipp-core.
          return toolJson({
            name: flow.name,
            description: flow.description,
            graph: flow.graph,
            note: 'Full FlowPlan DSL conversion is not yet implemented. This is the raw workflow graph.',
          });
        }

        case 'apply_flowplan': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');
          const flowPlan = params.flowPlan as FlowPlan;

          if (!flowPlan || typeof flowPlan !== 'object') {
            return toolError('apply_flowplan', 'flowPlan must be a valid FlowPlan object');
          }

          // Verify workflow exists
          const flow = await api.getFlow(flowId);
          if (!flow) {
            return toolError('apply_flowplan', `Workflow "${flowId}" not found`);
          }

          // For now, return guidance. Full implementation needs compileFlowPlan from zipp-core.
          return toolSuccess(`FlowPlan compilation requires zipp-core integration. For now, manually add nodes and connections using:
1. add_node() - to add each node
2. connect_nodes() - to create edges between nodes

FlowPlan received: ${flowPlan.name || 'unnamed'}`);
        }

        // === Introspection ===
        case 'list_available_nodes': {
          const nodes = await api.listNodes();
          return toolJson({
            count: nodes.length,
            nodes: nodes.map(n => ({
              id: n.id,
              name: n.name,
              description: n.description,
              icon: n.icon,
              color: n.color,
            })),
          });
        }

        case 'get_node_definition': {
          const params = args as Record<string, unknown>;
          const nodeType = validateString(params.nodeType, 'nodeType');

          const nodeDef = await api.getNodeDefinition(nodeType);
          if (!nodeDef) {
            return toolError('get_node_definition', `Node type "${nodeType}" not found`);
          }
          return toolJson(nodeDef);
        }

        case 'list_modules': {
          const modules = await api.listModules();
          return toolJson({
            count: modules.length,
            modules,
          });
        }

        case 'validate_workflow': {
          const params = args as Record<string, unknown>;
          const flowId = validateString(params.flowId, 'flowId');

          const result = await api.validateFlow(flowId);
          const hasWarnings = result.warnings && result.warnings.length > 0;

          let message = result.valid
            ? 'Workflow is valid and ready to run.'
            : `Workflow has ${result.errors.length} error(s).`;

          if (hasWarnings) {
            message += ` ${result.warnings!.length} warning(s) found.`;
          }

          return toolJson({
            flowId,
            valid: result.valid,
            errors: result.errors,
            warnings: result.warnings || [],
            message,
          });
        }

        // === Service Management ===
        case 'list_services': {
          const services = await api.listServices();
          return toolJson({
            count: services.length,
            services: services.map(s => ({
              id: s.id,
              name: s.name,
              description: s.description,
              port: s.port,
              installed: s.installed,
            })),
          });
        }

        case 'get_service_status': {
          const params = args as Record<string, unknown>;
          const serviceId = validateString(params.serviceId, 'serviceId');

          const status = await api.getServiceStatus(serviceId);
          if (!status) {
            return toolError('get_service_status', `Service "${serviceId}" not found`);
          }
          return toolJson({
            serviceId: status.id,
            running: status.running,
            healthy: status.healthy,
            port: status.port,
            url: status.running ? `http://localhost:${status.port}` : null,
          });
        }

        case 'start_service': {
          const params = args as Record<string, unknown>;
          const serviceId = validateString(params.serviceId, 'serviceId');
          const envVars = params.envVars as Record<string, string> | undefined;

          const status = await api.startService(serviceId, envVars);
          return toolJson({
            serviceId: status.id,
            running: status.running,
            healthy: status.healthy,
            port: status.port,
            url: `http://localhost:${status.port}`,
            message: `Service "${serviceId}" started on port ${status.port}. It may take a moment to become healthy.`,
          });
        }

        case 'stop_service': {
          const params = args as Record<string, unknown>;
          const serviceId = validateString(params.serviceId, 'serviceId');

          const status = await api.stopService(serviceId);
          return toolJson({
            serviceId: status.id,
            running: status.running,
            message: `Service "${serviceId}" stopped.`,
          });
        }

        case 'get_service_output': {
          const params = args as Record<string, unknown>;
          const serviceId = validateString(params.serviceId, 'serviceId');
          const limit = validateOptionalNumber(params.limit, 'limit', 1, 1000);

          const output = await api.getServiceOutput(serviceId, limit);
          return toolJson({
            serviceId: output.service_id,
            lineCount: output.lines.length,
            output: output.lines.join('\n'),
          });
        }

        case 'clear_service_output': {
          const params = args as Record<string, unknown>;
          const serviceId = validateString(params.serviceId, 'serviceId');

          await api.clearServiceOutput(serviceId);
          return toolSuccess(`Cleared output logs for service "${serviceId}"`);
        }

        default:
          return toolError('unknown', `Unknown tool: ${name}`);
      }
    } catch (error) {
      // Include tool name in error message for better debugging
      const errorMessage = ZippApiClient.formatError(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `[${name}] Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // --- List Resources Handler ---
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'zipp://workflows',
          name: 'All Workflows',
          description: 'List of all workflows in Zipp',
          mimeType: 'application/json',
        },
        {
          uri: 'zipp://nodes',
          name: 'Available Nodes',
          description: 'All available node types',
          mimeType: 'application/json',
        },
        {
          uri: 'zipp://modules',
          name: 'Loaded Modules',
          description: 'All loaded modules and their capabilities',
          mimeType: 'application/json',
        },
        {
          uri: 'zipp://services',
          name: 'Available Services',
          description: 'All available services and their status',
          mimeType: 'application/json',
        },
      ],
    };
  });

  // --- Read Resource Handler ---
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      if (uri === 'zipp://workflows') {
        const flows = await api.listFlows();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(flows, null, 2),
            },
          ],
        };
      }

      if (uri === 'zipp://nodes') {
        const nodes = await api.listNodes();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(nodes, null, 2),
            },
          ],
        };
      }

      if (uri === 'zipp://modules') {
        const modules = await api.listModules();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(modules, null, 2),
            },
          ],
        };
      }

      if (uri === 'zipp://services') {
        const services = await api.listServices();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(services, null, 2),
            },
          ],
        };
      }

      // Handle dynamic URIs like zipp://workflows/{id}
      const workflowMatch = uri.match(/^zipp:\/\/workflows\/(.+)$/);
      if (workflowMatch) {
        const flowId = workflowMatch[1];
        const flow = await api.getFlow(flowId);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: flow ? JSON.stringify(flow, null, 2) : `Workflow "${flowId}" not found`,
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Unknown resource: ${uri}`,
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Error reading resource: ${ZippApiClient.formatError(error)}`,
          },
        ],
      };
    }
  });

  return server;
}

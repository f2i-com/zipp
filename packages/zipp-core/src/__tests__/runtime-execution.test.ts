/**
 * Runtime Execution Tests
 *
 * Tests that workflows actually produce correct output.
 * These are end-to-end tests that execute graphs through the runtime.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ZippCompiler } from '../compiler.js';
import { createRuntime, ZippRuntime } from '../runtime.js';
import type { WorkflowGraph, GraphNode, GraphEdge } from '../types.js';

// Helper to create a basic node
function createNode(id: string, type: string, data: Record<string, unknown> = {}): GraphNode {
  return {
    id,
    type: type as GraphNode['type'],
    position: { x: 0, y: 0 },
    data,
  };
}

// Helper to create an edge
function createEdge(source: string, target: string, sourceHandle?: string, targetHandle?: string): GraphEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
}

describe('Runtime Execution', () => {
  let runtime: ZippRuntime;
  let logs: Array<{ message: string; type?: string }>;
  let nodeStatuses: Array<{ nodeId: string; status: string }>;

  beforeEach(() => {
    logs = [];
    nodeStatuses = [];

    runtime = createRuntime(
      undefined, // onToken
      (entry) => logs.push({ message: entry.message, type: entry.type }), // onLog
      undefined, // onImage
      (nodeId, status) => nodeStatuses.push({ nodeId, status }), // onNodeStatus
    );
  });

  describe('Simple Workflows', () => {
    it('should execute a single input node', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'greeting', value: 'Hello World' }),
        ],
        edges: [],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      // The workflow context should contain the input value
      expect(result).toHaveProperty('input1');
    });

    it('should execute input with external input values', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'name', value: 'default' }),
        ],
        edges: [],
      };

      const result = runtime.convertResultToJs(
        await runtime.runWorkflow(graph, undefined, { name: 'Custom Value' })
      );

      expect(result).toBeDefined();
    });

    it('should execute multiple unconnected inputs', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'first', value: 'A' }),
          createNode('input2', 'input_text', { label: 'second', value: 'B' }),
          createNode('input3', 'input_text', { label: 'third', value: 'C' }),
        ],
        edges: [],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      expect(result).toHaveProperty('input1');
      expect(result).toHaveProperty('input2');
      expect(result).toHaveProperty('input3');
    });
  });

  describe('Template Processing', () => {
    it('should execute input connected to template', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'name', value: 'World' }),
          createNode('template1', 'template', { template: 'Hello, {{input}}!' }),
        ],
        edges: [
          createEdge('input1', 'template1', 'output', 'input'),
        ],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      expect(result).toHaveProperty('template1');
    });

    it('should chain multiple templates', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'value', value: 'test' }),
          createNode('template1', 'template', { template: 'First: {{input}}' }),
          createNode('template2', 'template', { template: 'Second: {{input}}' }),
        ],
        edges: [
          createEdge('input1', 'template1', 'output', 'input'),
          createEdge('template1', 'template2', 'output', 'input'),
        ],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      expect(result).toHaveProperty('template1');
      expect(result).toHaveProperty('template2');
    });
  });

  describe('Output Nodes', () => {
    it('should execute workflow ending with output node', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'message', value: 'Hello' }),
          createNode('output1', 'output', { label: 'result' }),
        ],
        edges: [
          createEdge('input1', 'output1', 'output', 'value'),
        ],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      expect(result).toHaveProperty('output1');
    });
  });

  describe('Conditional Workflows', () => {
    it('should execute condition node', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'value', value: '10' }),
          createNode('condition1', 'condition', {
            operator: 'greater_than',
            compareValue: '5',
          }),
        ],
        edges: [
          createEdge('input1', 'condition1', 'output', 'value'),
        ],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      expect(result).toHaveProperty('condition1');
    });
  });

  describe('Loop Workflows', () => {
    it('should execute count-based loop', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop-start', 'loop_start', { loopMode: 'count', iterations: 3 }),
          createNode('template1', 'template', { template: 'Iteration {{index}}' }),
          createNode('loop-end', 'loop_end', {}),
        ],
        edges: [
          createEdge('loop-start', 'template1', 'loop', 'input'),
          createEdge('template1', 'loop-end', 'output', 'value'),
        ],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      // Loop should have executed
      expect(result).toHaveProperty('loop-end');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty graph', async () => {
      const graph: WorkflowGraph = { nodes: [], edges: [] };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
    });

    it('should reject circular dependencies at compile time', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'template', { template: '{{input}}' }),
          createNode('b', 'template', { template: '{{input}}' }),
        ],
        edges: [
          createEdge('a', 'b', 'output', 'input'),
          createEdge('b', 'a', 'output', 'input'),
        ],
      };

      const compiler = new ZippCompiler();
      expect(() => compiler.compile(graph)).toThrow(/[Cc]ircular/);
    });
  });

  describe('Workflow Context', () => {
    it('should return workflow_context with all node outputs', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'a', value: '1' }),
          createNode('input2', 'input_text', { label: 'b', value: '2' }),
        ],
        edges: [],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph)) as Record<string, unknown>;

      expect(typeof result).toBe('object');
      expect(Object.keys(result)).toContain('input1');
      expect(Object.keys(result)).toContain('input2');
    });
  });

  describe('Logging', () => {
    it('should emit workflow start log', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'test', value: 'value' }),
        ],
        edges: [],
      };

      await runtime.runWorkflow(graph);

      // Check that workflow logs were captured
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Abort Signal', () => {
    it('should accept abort signal in runtime', async () => {
      const controller = new AbortController();

      const abortRuntime = createRuntime(
        undefined,
        undefined,
        undefined,
        undefined,
        controller.signal
      );

      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'test', value: 'value' }),
        ],
        edges: [],
      };

      // Should execute normally when not aborted
      const result = await abortRuntime.runWorkflow(graph);
      expect(result).toBeDefined();
    });
  });

  describe('Complex Workflows', () => {
    it('should execute diamond pattern (fork and join)', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input', 'input_text', { label: 'start', value: 'data' }),
          createNode('left', 'template', { template: 'Left: {{input}}' }),
          createNode('right', 'template', { template: 'Right: {{input}}' }),
          createNode('output', 'output', { label: 'merged' }),
        ],
        edges: [
          createEdge('input', 'left', 'output', 'input'),
          createEdge('input', 'right', 'output', 'input'),
          createEdge('left', 'output', 'output', 'value'),
        ],
      };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph));

      expect(result).toBeDefined();
      expect(result).toHaveProperty('left');
      expect(result).toHaveProperty('right');
      expect(result).toHaveProperty('output');
    });

    it('should execute long chain of nodes', async () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create chain of 20 nodes
      nodes.push(createNode('start', 'input_text', { label: 'input', value: 'chain' }));

      for (let i = 1; i <= 20; i++) {
        nodes.push(createNode(`node${i}`, 'template', { template: `Step ${i}: {{input}}` }));
        edges.push(createEdge(
          i === 1 ? 'start' : `node${i - 1}`,
          `node${i}`,
          'output',
          'input'
        ));
      }

      const graph: WorkflowGraph = { nodes, edges };

      const result = runtime.convertResultToJs(await runtime.runWorkflow(graph)) as Record<string, unknown>;

      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBeGreaterThanOrEqual(21);
    });
  });
});

/**
 * Tests for FlowPlan Decompiler
 *
 * Tests conversion of WorkflowGraph back to FlowPlan DSL.
 */

import { describe, it, expect } from '@jest/globals';
import { decompileFlowPlan } from '../flowplan-decompiler.js';
import type { WorkflowGraph, GraphNode, GraphEdge } from '../types.js';

// Helper to create a minimal node
function createNode(overrides: Partial<GraphNode> & { id: string; type: string }): GraphNode {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as GraphNode;
}

// Helper to create an edge
function createEdge(source: string, target: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...overrides,
  };
}

// Helper to create a minimal graph
function createGraph(nodes: GraphNode[], edges: GraphEdge[] = []): WorkflowGraph {
  return { nodes, edges };
}

describe('decompileFlowPlan', () => {
  describe('basic decompilation', () => {
    it('should decompile empty graph', () => {
      const graph = createGraph([]);
      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.name).toBe('Imported Workflow');
    });

    it('should return result with expected structure', () => {
      const graph = createGraph([
        createNode({ id: 'n1', type: 'input_text', data: { label: 'input' } }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should set default name and description', () => {
      const graph = createGraph([]);
      const result = decompileFlowPlan(graph);

      expect(result.plan!.name).toBe('Imported Workflow');
      expect(result.plan!.description).toBe('Workflow imported from visual editor');
    });
  });

  describe('input decompilation', () => {
    it('should decompile input_text nodes to text inputs', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'input_text',
          data: { label: 'my_prompt', value: 'default value' },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.inputs.length).toBe(1);
      expect(result.plan!.inputs[0].name).toBe('my_prompt');
      expect(result.plan!.inputs[0].type).toBe('text');
      expect(result.plan!.inputs[0].default).toBe('default value');
    });

    it('should decompile input_file nodes to file_path inputs', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'input_file',
          data: { label: 'image_file' },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.inputs.length).toBe(1);
      expect(result.plan!.inputs[0].type).toBe('file_path');
    });

    it('should preserve input description', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'input_text',
          data: { label: 'prompt', description: 'Enter your prompt' },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.inputs[0].description).toBe('Enter your prompt');
    });

    it('should generate default names for unlabeled inputs', () => {
      const graph = createGraph([
        createNode({ id: 'n1', type: 'input_text', data: {} }),
        createNode({ id: 'n2', type: 'input_text', data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.inputs[0].name).toBe('input_1');
      expect(result.plan!.inputs[1].name).toBe('input_2');
    });
  });

  describe('collection decompilation', () => {
    it('should decompile input_folder nodes to collections', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'input_folder',
          data: {
            path: 'C:/images',
            recursive: true,
            includePatterns: '*.jpg, *.png',
            maxFiles: 50,
          },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.collections).toBeDefined();
      expect(result.plan!.collections!.length).toBe(1);
      expect(result.plan!.collections![0].type).toBe('folder_files');
    });

    it('should extract collection options', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'input_folder',
          data: {
            recursive: true,
            maxFiles: 100,
            includePatterns: '*.txt',
          },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      const collection = result.plan!.collections![0];
      expect(collection.recursive).toBe(true);
      expect(collection.max).toBe(100);
    });

    it('should parse include patterns', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'input_folder',
          data: {
            includePatterns: '*.jpg, *.png, *.gif',
          },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.collections![0].include).toContain('*.jpg');
      expect(result.plan!.collections![0].include).toContain('*.png');
    });
  });

  describe('step decompilation', () => {
    it('should handle template nodes in graph', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'template',
          position: { x: 100, y: 100 },
          data: { template: 'Hello {{name}}' },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      // Steps may or may not be created depending on registered step types
    });

    it('should handle ai_llm nodes in graph', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'ai_llm',
          position: { x: 100, y: 100 },
          data: { systemPrompt: 'You are helpful' },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
    });

    it('should handle file_read nodes in graph', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'file_read',
          position: { x: 100, y: 100 },
          data: { readAs: 'base64' },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
    });

    it('should handle output nodes in graph', () => {
      const graph = createGraph([
        createNode({
          id: 'n1',
          type: 'output',
          position: { x: 100, y: 100 },
          data: { label: 'Result' },
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
    });
  });

  describe('loop decompilation', () => {
    it('should detect loop structure', () => {
      const graph = createGraph([
        createNode({
          id: 'loop-start',
          type: 'loop_start',
          position: { x: 100, y: 100 },
          data: { loopMode: 'foreach' },
        }),
        createNode({
          id: 'loop-end',
          type: 'loop_end',
          position: { x: 300, y: 100 },
          data: {},
        }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.loop).toBeDefined();
    });

    it('should extract loop mode as for_each', () => {
      const graph = createGraph([
        createNode({
          id: 'loop-start',
          type: 'loop_start',
          position: { x: 100, y: 100 },
          data: { loopMode: 'foreach' },
        }),
        createNode({ id: 'loop-end', type: 'loop_end', position: { x: 300, y: 100 }, data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.loop!.mode).toBe('for_each');
    });

    it('should extract loop mode as count', () => {
      const graph = createGraph([
        createNode({
          id: 'loop-start',
          type: 'loop_start',
          position: { x: 100, y: 100 },
          data: { loopMode: 'count', iterations: 5 },
        }),
        createNode({ id: 'loop-end', type: 'loop_end', position: { x: 300, y: 100 }, data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.loop!.mode).toBe('count');
      expect(result.plan!.loop!.over).toBe('5');
    });

    it('should not create loop when only loop_start exists', () => {
      const graph = createGraph([
        createNode({ id: 'loop-start', type: 'loop_start', position: { x: 100, y: 100 }, data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.loop).toBeUndefined();
      expect(result.plan!.steps).toBeDefined();
    });

    it('should use collection name in loop over field', () => {
      const graph = createGraph([
        createNode({ id: 'c1', type: 'input_folder', position: { x: 0, y: 0 }, data: {} }),
        createNode({
          id: 'loop-start',
          type: 'loop_start',
          position: { x: 100, y: 100 },
          data: { loopMode: 'foreach' },
        }),
        createNode({ id: 'loop-end', type: 'loop_end', position: { x: 300, y: 100 }, data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.loop).toBeDefined();
      expect(result.plan!.loop!.over).toBe('files_1'); // Uses generated collection name
    });
  });

  describe('edge handling', () => {
    it('should handle graph with edges', () => {
      const graph = createGraph(
        [
          createNode({ id: 'n1', type: 'input_text', position: { x: 0, y: 0 }, data: { label: 'input' } }),
          createNode({ id: 'n2', type: 'template', position: { x: 200, y: 0 }, data: {} }),
        ],
        [createEdge('n1', 'n2')]
      );

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
    });

    it('should find input references from edges', () => {
      const graph = createGraph(
        [
          createNode({ id: 'n1', type: 'input_text', position: { x: 0, y: 0 }, data: { label: 'prompt' } }),
          createNode({ id: 'n2', type: 'ai_llm', position: { x: 200, y: 0 }, data: {} }),
        ],
        [createEdge('n1', 'n2', { targetHandle: 'prompt' })]
      );

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle malformed graph gracefully', () => {
      // Create a graph with nodes but no required properties
      const graph = { nodes: [], edges: [] } as WorkflowGraph;

      const result = decompileFlowPlan(graph);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should handle unknown node types with warnings', () => {
      const graph = createGraph([
        createNode({ id: 'n1', type: 'custom_unknown_type' as any, position: { x: 0, y: 0 }, data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      // Unknown types should be handled
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('complex workflows', () => {
    it('should decompile workflow with inputs', () => {
      const graph = createGraph(
        [
          createNode({ id: 'i1', type: 'input_text', position: { x: 0, y: 0 }, data: { label: 'prompt' } }),
          createNode({ id: 's1', type: 'template', position: { x: 200, y: 0 }, data: { template: '{{prompt}}' } }),
        ],
        [createEdge('i1', 's1')]
      );

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.inputs.length).toBe(1);
    });

    it('should decompile workflow with collections and loop', () => {
      const graph = createGraph([
        createNode({ id: 'c1', type: 'input_folder', position: { x: 0, y: 0 }, data: {} }),
        createNode({ id: 'ls', type: 'loop_start', position: { x: 200, y: 0 }, data: { loopMode: 'foreach' } }),
        createNode({ id: 's1', type: 'template', position: { x: 400, y: 0 }, data: {} }),
        createNode({ id: 'le', type: 'loop_end', position: { x: 600, y: 0 }, data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.collections).toBeDefined();
      expect(result.plan!.loop).toBeDefined();
    });

    it('should decompile multiple input nodes', () => {
      const graph = createGraph([
        createNode({ id: 'i1', type: 'input_text', data: { label: 'prompt1' } }),
        createNode({ id: 'i2', type: 'input_text', data: { label: 'prompt2' } }),
        createNode({ id: 'i3', type: 'input_file', data: { label: 'file' } }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.inputs.length).toBe(3);
    });

    it('should decompile multiple collection nodes', () => {
      const graph = createGraph([
        createNode({ id: 'c1', type: 'input_folder', data: { path: '/path1' } }),
        createNode({ id: 'c2', type: 'input_folder', data: { path: '/path2' } }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.success).toBe(true);
      expect(result.plan!.collections!.length).toBe(2);
    });
  });

  describe('FlowPlan structure', () => {
    it('should create valid FlowPlan structure', () => {
      const graph = createGraph([
        createNode({ id: 'i1', type: 'input_text', data: { label: 'input' } }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan).toBeDefined();
      expect(result.plan!.name).toBeDefined();
      expect(result.plan!.description).toBeDefined();
      expect(Array.isArray(result.plan!.inputs)).toBe(true);
    });

    it('should omit collections when none exist', () => {
      const graph = createGraph([
        createNode({ id: 'i1', type: 'input_text', data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.collections).toBeUndefined();
    });

    it('should create steps array when no loop', () => {
      const graph = createGraph([
        createNode({ id: 'n1', type: 'template', position: { x: 100, y: 100 }, data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.steps).toBeDefined();
      expect(result.plan!.loop).toBeUndefined();
    });

    it('should create loop object when loop exists', () => {
      const graph = createGraph([
        createNode({ id: 'ls', type: 'loop_start', data: { loopMode: 'foreach' } }),
        createNode({ id: 'le', type: 'loop_end', data: {} }),
      ]);

      const result = decompileFlowPlan(graph);

      expect(result.plan!.loop).toBeDefined();
      expect(result.plan!.loop!.mode).toBeDefined();
      expect(result.plan!.loop!.over).toBeDefined();
      expect(result.plan!.loop!.itemAlias).toBeDefined();
      expect(Array.isArray(result.plan!.loop!.steps)).toBe(true);
    });
  });
});

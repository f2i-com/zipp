/**
 * Compiler Tests
 *
 * Tests for the ZippCompiler that converts visual workflow graphs to FormLogic scripts.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ZippCompiler } from '../compiler';
import type { WorkflowGraph, GraphNode, GraphEdge } from '../types';

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

describe('ZippCompiler', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  describe('Basic Compilation', () => {
    it('should compile an empty graph', () => {
      const graph: WorkflowGraph = {
        nodes: [],
        edges: [],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('// Auto-generated Zipp Workflow Script');
      expect(script).toContain('workflow_context');
    });

    it('should compile a single node graph', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('node1', 'input_text', { value: 'hello' })],
        edges: [],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('node1');
      expect(script).toContain('workflow_context');
    });

    it('should compile nodes in topological order', () => {
      // Create a chain: node1 -> node2 -> node3
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node3', 'output'),
          createNode('node1', 'input_text', { value: 'start' }),
          createNode('node2', 'template', { template: '{{input}}' }),
        ],
        edges: [
          createEdge('node1', 'node2'),
          createEdge('node2', 'node3'),
        ],
      };

      const script = compiler.compile(graph);

      // Check that node1 appears before node2 in the comments
      const node1Index = script.indexOf('node1');
      const node2Index = script.indexOf('node2');
      const node3Index = script.indexOf('node3');

      expect(node1Index).toBeLessThan(node2Index);
      expect(node2Index).toBeLessThan(node3Index);
    });
  });

  describe('Cycle Detection', () => {
    it('should throw an error for circular dependencies', () => {
      // Create a cycle: node1 -> node2 -> node3 -> node1
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'template'),
          createNode('node2', 'template'),
          createNode('node3', 'template'),
        ],
        edges: [
          createEdge('node1', 'node2'),
          createEdge('node2', 'node3'),
          createEdge('node3', 'node1'),
        ],
      };

      expect(() => compiler.compile(graph)).toThrow(/Circular dependency/);
    });

    it('should allow valid loop structures (loop_start -> loop_end)', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 3 }),
          createNode('inner', 'template', { template: 'iteration' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
          createEdge('loop_end', 'loop_start'), // Back edge - allowed for loops
        ],
      };

      // Should not throw
      expect(() => compiler.compile(graph)).not.toThrow();
    });
  });

  describe('Input Escaping', () => {
    it('should escape special characters in string values', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'input_text', { value: 'test "quotes" and \\backslash' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);

      // Should not contain unescaped quotes that would break the script
      expect(script).not.toMatch(/value = ".*[^\\]".*"/);
    });

    it('should handle newlines in string values', () => {
      // Test by passing inputs with newlines - these get compiled into __inputs
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'input_text'),
        ],
        edges: [],
      };

      // Pass inputs with special characters that need escaping
      const inputs = {
        testInput: 'line1\nline2\nline3',
      };

      const script = compiler.compile(graph, inputs);

      // The input string should be escaped properly in the generated __inputs object
      // JSON.stringify converts \n to \\n, which should appear in the script
      expect(script).toContain('line1\\nline2\\nline3');
    });

    it('should handle empty objects safely', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'template', { template: '{{input}}' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph, {});

      // Should contain properly formatted empty object
      expect(script).toContain('__inputs');
    });
  });

  describe('Loop Compilation', () => {
    it('should generate loop code for count mode', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 5 }),
          createNode('inner', 'template', { template: 'step {{index}}' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('for (let');
      expect(script).toContain('Loop');
    });

    it('should generate loop code for foreach mode', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'foreach' }),
          createNode('inner', 'template', { template: '{{item}}' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('for (let');
      expect(script).toContain('length');
    });

    it('should cap iterations at 1000 to prevent DOS', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 999999 }),
          createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
        ],
        edges: [
          createEdge('loop_start', 'loop_end', 'loop'),
        ],
      };

      const script = compiler.compile(graph);

      // Should cap at 1000
      expect(script).toContain('1000');
      expect(script).not.toContain('999999');
    });
  });

  describe('Edge Cases', () => {
    it('should handle nodes with no connections', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'input_text', { value: 'a' }),
          createNode('node2', 'input_text', { value: 'b' }),
          createNode('node3', 'input_text', { value: 'c' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('node1');
      expect(script).toContain('node2');
      expect(script).toContain('node3');
    });

    it('should filter out edges referencing non-existent nodes', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'input_text', { value: 'test' }),
        ],
        edges: [
          createEdge('node1', 'nonexistent'),
          createEdge('ghost', 'node1'),
        ],
      };

      // Should not throw
      expect(() => compiler.compile(graph)).not.toThrow();
    });

    it('should handle unicode characters in values', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'input_text', { value: '日本語テスト 🎉 émojis' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);

      // Should compile without errors
      expect(script).toBeDefined();
    });

    it('should sanitize node IDs for use as variable names', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node-with-dashes', 'input_text', { value: 'test' }),
          createNode('node.with.dots', 'input_text', { value: 'test2' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);

      // Should use underscores instead of special characters
      expect(script).toContain('node_with_dashes');
      expect(script).toContain('node_with_dots');
    });
  });

  describe('Stop Conditions', () => {
    it('should generate contains stop condition check', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('loop_end', 'loop_end', { stopCondition: 'contains', stopValue: 'DONE' }),
        ],
        edges: [
          createEdge('loop_start', 'loop_end', 'loop'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('indexOf');
      expect(script).toContain('done'); // Case-insensitive
    });

    it('should generate equals stop condition check', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('loop_end', 'loop_end', { stopCondition: 'equals', stopValue: 'complete' }),
        ],
        edges: [
          createEdge('loop_start', 'loop_end', 'loop'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('===');
      expect(script).toContain('complete');
    });

    it('should generate JSON field stop condition check', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('loop_end', 'loop_end', {
            stopCondition: 'json_field',
            stopField: 'status',
            stopValue: 'finished'
          }),
        ],
        edges: [
          createEdge('loop_start', 'loop_end', 'loop'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('JSON.parse');
      expect(script).toContain('status');
      expect(script).toContain('finished');
    });
  });
});

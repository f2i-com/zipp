import { describe, it, expect } from '@jest/globals';
import { detectCycles } from '../CycleDetector.js';
import type { WorkflowGraph, GraphNode, GraphEdge } from '../../types.js';

// Helper to create a node
function createNode(id: string, type: string): GraphNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  } as GraphNode;
}

// Helper to create an edge
function createEdge(source: string, target: string, sourceHandle?: string, targetHandle?: string): GraphEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  } as GraphEdge;
}

describe('CycleDetector', () => {
  describe('detectCycles', () => {
    it('should return null for an empty graph', () => {
      const graph: WorkflowGraph = { nodes: [], edges: [] };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should return null for a single node with no edges', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('a', 'ai_llm')],
        edges: [],
      };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should return null for a linear chain', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'input_text'),
          createNode('b', 'ai_llm'),
          createNode('c', 'output_text'),
        ],
        edges: [
          createEdge('a', 'b'),
          createEdge('b', 'c'),
        ],
      };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should return null for a DAG (tree structure)', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'input_text'),
          createNode('b', 'ai_llm'),
          createNode('c', 'ai_llm'),
          createNode('d', 'output_text'),
        ],
        edges: [
          createEdge('a', 'b'),
          createEdge('a', 'c'),
          createEdge('b', 'd'),
          createEdge('c', 'd'),
        ],
      };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should detect a simple two-node cycle', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'ai_llm'),
          createNode('b', 'ai_llm'),
        ],
        edges: [
          createEdge('a', 'b'),
          createEdge('b', 'a'),
        ],
      };
      const result = detectCycles(graph);
      expect(result).not.toBeNull();
      // Cycle could be reported as either direction
      expect(result).toMatch(/[ab] -> [ab]/);
    });

    it('should detect a three-node cycle', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'ai_llm'),
          createNode('b', 'ai_llm'),
          createNode('c', 'ai_llm'),
        ],
        edges: [
          createEdge('a', 'b'),
          createEdge('b', 'c'),
          createEdge('c', 'a'),
        ],
      };
      const result = detectCycles(graph);
      expect(result).not.toBeNull();
    });

    it('should detect a self-loop', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'ai_llm'),
        ],
        edges: [
          createEdge('a', 'a'),
        ],
      };
      expect(detectCycles(graph)).toBe('a -> a');
    });

    it('should allow valid loop_start -> loop_end back-edge', () => {
      // Valid loop structure: loop_start -> inner nodes -> loop_end -> back to loop_start
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop1', 'loop_start'),
          createNode('process', 'ai_llm'),
          createNode('loop1_end', 'loop_end'),
        ],
        edges: [
          createEdge('loop1', 'process'),
          createEdge('process', 'loop1_end'),
          createEdge('loop1_end', 'loop1'), // Valid back-edge
        ],
      };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should allow valid loop with explicit loop handle', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop1', 'loop_start'),
          createNode('process', 'ai_llm'),
          createNode('loop1_end', 'loop_end'),
        ],
        edges: [
          createEdge('loop1', 'loop1_end', 'loop'), // Explicit loop handle
          createEdge('loop1', 'process'),
          createEdge('process', 'loop1_end'),
          createEdge('loop1_end', 'loop1'),
        ],
      };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should detect invalid loop_end -> wrong loop_start cycle', () => {
      // Two loops where loop_end of one tries to connect to loop_start of another
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop1', 'loop_start'),
          createNode('loop1_end', 'loop_end'),
          createNode('loop2', 'loop_start'),
          createNode('loop2_end', 'loop_end'),
        ],
        edges: [
          createEdge('loop1', 'loop1_end'),
          createEdge('loop2', 'loop2_end'),
          createEdge('loop1_end', 'loop2'), // Invalid: loop1_end -> loop2 (wrong loop_start)
          createEdge('loop2_end', 'loop1'), // This creates a cycle
        ],
      };
      const result = detectCycles(graph);
      expect(result).not.toBeNull();
    });

    it('should handle nested loops with explicit loop handles', () => {
      // Outer loop contains inner loop
      // For nested loops, explicit loop handles are required
      const graph: WorkflowGraph = {
        nodes: [
          createNode('outer_start', 'loop_start'),
          createNode('inner_start', 'loop_start'),
          createNode('process', 'ai_llm'),
          createNode('inner_end', 'loop_end'),
          createNode('outer_end', 'loop_end'),
        ],
        edges: [
          createEdge('outer_start', 'outer_end', 'loop'), // Explicit loop handle for outer
          createEdge('outer_start', 'inner_start'),
          createEdge('inner_start', 'inner_end', 'loop'), // Explicit loop handle for inner
          createEdge('inner_start', 'process'),
          createEdge('process', 'inner_end'),
          createEdge('inner_end', 'inner_start'), // Inner loop back-edge
          createEdge('inner_end', 'outer_end'),
          createEdge('outer_end', 'outer_start'), // Outer loop back-edge
        ],
      };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should handle disconnected components', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'ai_llm'),
          createNode('b', 'ai_llm'),
          createNode('c', 'ai_llm'),
          createNode('d', 'ai_llm'),
        ],
        edges: [
          createEdge('a', 'b'),
          createEdge('c', 'd'),
        ],
      };
      expect(detectCycles(graph)).toBeNull();
    });

    it('should detect cycle in one disconnected component', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'ai_llm'),
          createNode('b', 'ai_llm'),
          createNode('c', 'ai_llm'),
          createNode('d', 'ai_llm'),
        ],
        edges: [
          createEdge('a', 'b'),
          createEdge('c', 'd'),
          createEdge('d', 'c'), // Cycle in second component
        ],
      };
      const result = detectCycles(graph);
      expect(result).not.toBeNull();
    });

    it('should handle complex valid DAG', () => {
      // Diamond pattern with multiple paths
      const graph: WorkflowGraph = {
        nodes: [
          createNode('start', 'input_text'),
          createNode('a', 'ai_llm'),
          createNode('b', 'ai_llm'),
          createNode('c', 'ai_llm'),
          createNode('d', 'ai_llm'),
          createNode('end', 'output_text'),
        ],
        edges: [
          createEdge('start', 'a'),
          createEdge('start', 'b'),
          createEdge('a', 'c'),
          createEdge('a', 'd'),
          createEdge('b', 'c'),
          createEdge('b', 'd'),
          createEdge('c', 'end'),
          createEdge('d', 'end'),
        ],
      };
      expect(detectCycles(graph)).toBeNull();
    });
  });
});

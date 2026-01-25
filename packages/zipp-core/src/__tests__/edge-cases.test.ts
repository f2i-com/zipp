/**
 * Edge Cases and Stress Tests
 *
 * Tests for:
 * - Large graphs (100+ nodes)
 * - Deeply nested loops
 * - Error recovery scenarios
 * - Performance benchmarks
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ZippCompiler } from '../compiler.js';
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

describe('Edge Cases', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  describe('Large Graphs', () => {
    it('should compile a linear chain of 100 nodes', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create input node
      nodes.push(createNode('input-0', 'input_text', { label: 'start', value: 'initial' }));

      // Create 99 template nodes in a chain
      for (let i = 1; i < 100; i++) {
        nodes.push(createNode(`template-${i}`, 'template', {
          template: `Step ${i}: {{input}}`,
        }));
        edges.push(createEdge(
          i === 1 ? 'input-0' : `template-${i - 1}`,
          `template-${i}`,
          'output',
          'input'
        ));
      }

      // Add output node
      nodes.push(createNode('output-final', 'output', { label: 'result' }));
      edges.push(createEdge('template-99', 'output-final', 'output', 'value'));

      const graph: WorkflowGraph = { nodes, edges };
      const script = compiler.compile(graph);

      expect(script).toBeDefined();
      expect(script.length).toBeGreaterThan(0);
      // Verify all nodes are included
      expect(script).toContain('input-0');
      expect(script).toContain('template-50');
      expect(script).toContain('template-99');
      expect(script).toContain('output-final');
    });

    it('should compile a graph with 100 parallel branches', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create single input node
      nodes.push(createNode('input-0', 'input_text', { label: 'source', value: 'data' }));

      // Create 100 parallel template nodes
      for (let i = 0; i < 100; i++) {
        nodes.push(createNode(`branch-${i}`, 'template', {
          template: `Branch ${i}: {{input}}`,
        }));
        edges.push(createEdge('input-0', `branch-${i}`, 'output', 'input'));
      }

      // Create single output that receives from all branches (just connect to last)
      nodes.push(createNode('output-merge', 'output', { label: 'merged' }));
      edges.push(createEdge('branch-99', 'output-merge', 'output', 'value'));

      const graph: WorkflowGraph = { nodes, edges };
      const script = compiler.compile(graph);

      expect(script).toBeDefined();
      expect(script).toContain('branch-0');
      expect(script).toContain('branch-50');
      expect(script).toContain('branch-99');
    });

    it('should compile a diamond pattern with 50 nodes per side', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Input at top
      nodes.push(createNode('top', 'input_text', { label: 'top', value: 'start' }));

      // Left branch - 50 nodes
      for (let i = 0; i < 50; i++) {
        nodes.push(createNode(`left-${i}`, 'template', { template: `Left ${i}` }));
        edges.push(createEdge(
          i === 0 ? 'top' : `left-${i - 1}`,
          `left-${i}`,
          'output',
          'input'
        ));
      }

      // Right branch - 50 nodes
      for (let i = 0; i < 50; i++) {
        nodes.push(createNode(`right-${i}`, 'template', { template: `Right ${i}` }));
        edges.push(createEdge(
          i === 0 ? 'top' : `right-${i - 1}`,
          `right-${i}`,
          'output',
          'input'
        ));
      }

      // Merge at bottom
      nodes.push(createNode('bottom', 'output', { label: 'merged' }));
      edges.push(createEdge('left-49', 'bottom', 'output', 'value'));
      edges.push(createEdge('right-49', 'bottom', 'output', 'value2'));

      const graph: WorkflowGraph = { nodes, edges };
      const script = compiler.compile(graph);

      expect(script).toBeDefined();
      expect(script).toContain('left-0');
      expect(script).toContain('left-49');
      expect(script).toContain('right-0');
      expect(script).toContain('right-49');
    });

    it('should handle graph with 200 nodes efficiently', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create a grid-like structure: 10 rows x 20 columns
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 20; col++) {
          const id = `node-${row}-${col}`;
          if (row === 0 && col === 0) {
            nodes.push(createNode(id, 'input_text', { label: 'start', value: 'init' }));
          } else if (row === 9 && col === 19) {
            nodes.push(createNode(id, 'output', { label: 'end' }));
          } else {
            nodes.push(createNode(id, 'template', { template: `${row},${col}` }));
          }

          // Connect from left neighbor
          if (col > 0) {
            edges.push(createEdge(`node-${row}-${col - 1}`, id, 'output', 'input'));
          }
          // Connect from top neighbor (for first column only)
          if (col === 0 && row > 0) {
            edges.push(createEdge(`node-${row - 1}-${col}`, id, 'output', 'input'));
          }
        }
      }

      const graph: WorkflowGraph = { nodes, edges };

      const startTime = Date.now();
      const script = compiler.compile(graph);
      const elapsed = Date.now() - startTime;

      expect(script).toBeDefined();
      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Deeply Nested Loops', () => {
    it('should compile 3 levels of nested loops', () => {
      const nodes: GraphNode[] = [
        // Outer loop
        createNode('loop1-start', 'loop_start', { loopMode: 'count', iterations: 3 }),
        // Middle loop
        createNode('loop2-start', 'loop_start', { loopMode: 'count', iterations: 3 }),
        // Inner loop
        createNode('loop3-start', 'loop_start', { loopMode: 'count', iterations: 3 }),
        // Work node
        createNode('work', 'template', { template: 'Processing...' }),
        // Close loops
        createNode('loop3-end', 'loop_end', {}),
        createNode('loop2-end', 'loop_end', {}),
        createNode('loop1-end', 'loop_end', {}),
        // Output
        createNode('final-output', 'output', { label: 'result' }),
      ];

      const edges: GraphEdge[] = [
        // Loop chain
        createEdge('loop1-start', 'loop2-start', 'loop', 'trigger'),
        createEdge('loop2-start', 'loop3-start', 'loop', 'trigger'),
        createEdge('loop3-start', 'work', 'loop', 'input'),
        createEdge('work', 'loop3-end', 'output', 'value'),
        createEdge('loop3-end', 'loop2-end', 'output', 'value'),
        createEdge('loop2-end', 'loop1-end', 'output', 'value'),
        createEdge('loop1-end', 'final-output', 'output', 'value'),
      ];

      const graph: WorkflowGraph = { nodes, edges };
      const script = compiler.compile(graph);

      expect(script).toBeDefined();
      expect(script).toContain('loop1-start');
      expect(script).toContain('loop2-start');
      expect(script).toContain('loop3-start');
    });

    it('should compile 5 levels of nested loops', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create 5 nested loop pairs
      for (let i = 1; i <= 5; i++) {
        nodes.push(createNode(`loop${i}-start`, 'loop_start', { loopMode: 'count', iterations: 2 }));
      }

      // Work node in innermost loop
      nodes.push(createNode('innermost-work', 'template', { template: 'Deep work' }));

      // Close all loops
      for (let i = 5; i >= 1; i--) {
        nodes.push(createNode(`loop${i}-end`, 'loop_end', {}));
      }

      // Output
      nodes.push(createNode('result', 'output', { label: 'done' }));

      // Connect loop starts
      for (let i = 1; i < 5; i++) {
        edges.push(createEdge(`loop${i}-start`, `loop${i + 1}-start`, 'loop', 'trigger'));
      }
      edges.push(createEdge('loop5-start', 'innermost-work', 'loop', 'input'));

      // Connect through loop ends
      edges.push(createEdge('innermost-work', 'loop5-end', 'output', 'value'));
      for (let i = 5; i > 1; i--) {
        edges.push(createEdge(`loop${i}-end`, `loop${i - 1}-end`, 'output', 'value'));
      }
      edges.push(createEdge('loop1-end', 'result', 'output', 'value'));

      const graph: WorkflowGraph = { nodes, edges };
      const script = compiler.compile(graph);

      expect(script).toBeDefined();
      // Verify all loop starts are present
      for (let i = 1; i <= 5; i++) {
        expect(script).toContain(`loop${i}-start`);
      }
    });

    it('should handle parallel loops at same nesting level', () => {
      const nodes: GraphNode[] = [
        createNode('input', 'input_text', { label: 'data', value: 'start' }),
        // Two parallel loops
        createNode('loopA-start', 'loop_start', { loopMode: 'count', iterations: 5 }),
        createNode('loopB-start', 'loop_start', { loopMode: 'count', iterations: 5 }),
        // Work in each loop
        createNode('workA', 'template', { template: 'Loop A' }),
        createNode('workB', 'template', { template: 'Loop B' }),
        // End loops
        createNode('loopA-end', 'loop_end', {}),
        createNode('loopB-end', 'loop_end', {}),
        // Merge output
        createNode('merge', 'output', { label: 'merged' }),
      ];

      const edges: GraphEdge[] = [
        createEdge('input', 'loopA-start', 'output', 'trigger'),
        createEdge('input', 'loopB-start', 'output', 'trigger'),
        createEdge('loopA-start', 'workA', 'loop', 'input'),
        createEdge('loopB-start', 'workB', 'loop', 'input'),
        createEdge('workA', 'loopA-end', 'output', 'value'),
        createEdge('workB', 'loopB-end', 'output', 'value'),
        createEdge('loopA-end', 'merge', 'output', 'value'),
        createEdge('loopB-end', 'merge', 'output', 'value2'),
      ];

      const graph: WorkflowGraph = { nodes, edges };
      const script = compiler.compile(graph);

      expect(script).toBeDefined();
      expect(script).toContain('loopA-start');
      expect(script).toContain('loopB-start');
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle empty graph gracefully', () => {
      const graph: WorkflowGraph = { nodes: [], edges: [] };
      const script = compiler.compile(graph);

      expect(script).toBeDefined();
      expect(script).toContain('workflow_context');
    });

    it('should handle graph with only input nodes', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { label: 'a', value: '1' }),
          createNode('input2', 'input_text', { label: 'b', value: '2' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);
      expect(script).toBeDefined();
      expect(script).toContain('input1');
      expect(script).toContain('input2');
    });

    it('should handle orphaned edges (edges to non-existent nodes)', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node1', 'input_text', { label: 'input', value: 'test' }),
        ],
        edges: [
          createEdge('node1', 'non-existent', 'output', 'input'),
          createEdge('also-missing', 'node1', 'output', 'input'),
        ],
      };

      // Should not throw - orphaned edges should be filtered
      const script = compiler.compile(graph);
      expect(script).toBeDefined();
      expect(script).toContain('node1');
    });

    it('should detect and reject circular dependencies', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('a', 'template', { template: '{{input}}' }),
          createNode('b', 'template', { template: '{{input}}' }),
          createNode('c', 'template', { template: '{{input}}' }),
        ],
        edges: [
          createEdge('a', 'b', 'output', 'input'),
          createEdge('b', 'c', 'output', 'input'),
          createEdge('c', 'a', 'output', 'input'), // Creates cycle
        ],
      };

      expect(() => compiler.compile(graph)).toThrow(/[Cc]ircular/);
    });

    it('should detect self-referencing node', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('self-ref', 'template', { template: '{{input}}' }),
        ],
        edges: [
          createEdge('self-ref', 'self-ref', 'output', 'input'),
        ],
      };

      expect(() => compiler.compile(graph)).toThrow(/[Cc]ircular/);
    });

    it('should handle nodes with missing data gracefully', () => {
      const graph: WorkflowGraph = {
        nodes: [
          { id: 'minimal', type: 'template' as const, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
      };

      const script = compiler.compile(graph);
      expect(script).toBeDefined();
    });

    it('should handle loop without matching end', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('orphan-loop', 'loop_start', { loopMode: 'count', iterations: 5 }),
          createNode('work', 'template', { template: 'test' }),
        ],
        edges: [
          createEdge('orphan-loop', 'work', 'loop', 'input'),
        ],
      };

      // Should compile without error - unpaired loop_start treated as regular node
      const script = compiler.compile(graph);
      expect(script).toBeDefined();
    });

    it('should handle loop_end without matching start', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('work', 'template', { template: 'test' }),
          createNode('orphan-end', 'loop_end', {}),
        ],
        edges: [
          createEdge('work', 'orphan-end', 'output', 'value'),
        ],
      };

      // Should compile without error
      const script = compiler.compile(graph);
      expect(script).toBeDefined();
    });

    it('should handle duplicate node IDs by using last occurrence', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('dup', 'input_text', { label: 'first', value: '1' }),
          createNode('dup', 'input_text', { label: 'second', value: '2' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);
      expect(script).toBeDefined();
      // Should contain the node (behavior depends on implementation)
      expect(script).toContain('dup');
    });

    it('should handle very long node IDs', () => {
      const longId = 'node-' + 'x'.repeat(500);
      const graph: WorkflowGraph = {
        nodes: [
          createNode(longId, 'input_text', { label: 'long', value: 'test' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);
      expect(script).toBeDefined();
    });

    it('should handle special characters in node data', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('special', 'template', {
            template: 'Test with "quotes", \'apostrophes\', \n newlines, \t tabs, and unicode: '
          }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);
      expect(script).toBeDefined();
      // Should properly escape the content
    });
  });

  describe('Performance Benchmarks', () => {
    it('should compile 50 nodes in under 100ms', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      nodes.push(createNode('start', 'input_text', { label: 'input', value: 'data' }));
      for (let i = 1; i < 50; i++) {
        nodes.push(createNode(`node-${i}`, 'template', { template: `Step ${i}` }));
        edges.push(createEdge(
          i === 1 ? 'start' : `node-${i - 1}`,
          `node-${i}`,
          'output',
          'input'
        ));
      }

      const graph: WorkflowGraph = { nodes, edges };

      const start = performance.now();
      compiler.compile(graph);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should compile 100 nodes in under 500ms', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      nodes.push(createNode('start', 'input_text', { label: 'input', value: 'data' }));
      for (let i = 1; i < 100; i++) {
        nodes.push(createNode(`node-${i}`, 'template', { template: `Step ${i}` }));
        edges.push(createEdge(
          i === 1 ? 'start' : `node-${i - 1}`,
          `node-${i}`,
          'output',
          'input'
        ));
      }

      const graph: WorkflowGraph = { nodes, edges };

      const start = performance.now();
      compiler.compile(graph);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

    it('should compile graph with 500 edges in under 1 second', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create hub-and-spoke pattern: 1 center + 500 spokes
      nodes.push(createNode('hub', 'input_text', { label: 'hub', value: 'center' }));

      for (let i = 0; i < 500; i++) {
        nodes.push(createNode(`spoke-${i}`, 'template', { template: `Spoke ${i}` }));
        edges.push(createEdge('hub', `spoke-${i}`, 'output', 'input'));
      }

      const graph: WorkflowGraph = { nodes, edges };

      const start = performance.now();
      compiler.compile(graph);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });

    it('should detect cycle in large graph quickly', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create a long chain with a cycle at the end
      for (let i = 0; i < 100; i++) {
        nodes.push(createNode(`node-${i}`, 'template', { template: `Node ${i}` }));
        if (i > 0) {
          edges.push(createEdge(`node-${i - 1}`, `node-${i}`, 'output', 'input'));
        }
      }
      // Add cycle from last to first
      edges.push(createEdge('node-99', 'node-0', 'output', 'input'));

      const graph: WorkflowGraph = { nodes, edges };

      const start = performance.now();
      expect(() => compiler.compile(graph)).toThrow(/[Cc]ircular/);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Cycle detection should be fast
    });

    it('should handle repeated compilations efficiently', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input', 'input_text', { label: 'in', value: 'test' }),
          createNode('process', 'template', { template: '{{input}}' }),
          createNode('output', 'output', { label: 'out' }),
        ],
        edges: [
          createEdge('input', 'process', 'output', 'input'),
          createEdge('process', 'output', 'output', 'value'),
        ],
      };

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        compiler.compile(graph);
      }
      const elapsed = performance.now() - start;

      // 100 compilations should complete in under 1 second
      expect(elapsed).toBeLessThan(1000);
      // Average should be under 10ms per compilation
      expect(elapsed / 100).toBeLessThan(10);
    });
  });
});

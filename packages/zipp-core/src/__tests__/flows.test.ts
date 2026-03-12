/**
 * Flow Tests
 *
 * End-to-end tests for various workflow patterns:
 * - Simple linear flows
 * - Loop flows (count, foreach, while_true)
 * - Conditional flows
 * - Nested loops
 * - Stop conditions
 * - Input/output flows
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ZippCompiler } from '../compiler';
import { ZippRuntime, createRuntime } from '../runtime';
import type { WorkflowGraph, GraphNode, GraphEdge, LogCallback, Flow } from '../types';

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

describe('Flow Compilation Tests', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  describe('Simple Linear Flows', () => {
    it('should compile an empty flow', () => {
      const graph: WorkflowGraph = {
        nodes: [],
        edges: [],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('Auto-generated Zipp Workflow Script');
      expect(script).toContain('workflow_context');
      expect(script).toContain('Nodes:');
    });

    it('should compile a single input node', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('input1', 'input_text', { value: 'Hello World' })],
        edges: [],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('input1');
      expect(script).toContain('workflow_context');
    });

    it('should compile a chain of nodes', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { value: 'start' }),
          createNode('template1', 'template', { template: 'Processed: {{input}}' }),
          createNode('output1', 'output'),
        ],
        edges: [
          createEdge('input1', 'template1'),
          createEdge('template1', 'output1'),
        ],
      };

      const script = compiler.compile(graph);

      // Verify nodes appear in topological order
      const input1Index = script.indexOf('input1');
      const template1Index = script.indexOf('template1');
      const output1Index = script.indexOf('output1');

      expect(input1Index).toBeLessThan(template1Index);
      expect(template1Index).toBeLessThan(output1Index);
    });

    it('should handle multiple disconnected nodes', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { value: 'a' }),
          createNode('input2', 'input_text', { value: 'b' }),
          createNode('input3', 'input_text', { value: 'c' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('input1');
      expect(script).toContain('input2');
      expect(script).toContain('input3');
    });
  });

  describe('Loop Flows', () => {
    it('should compile count mode loop', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 5 }),
          createNode('inner', 'template', { template: 'iteration {{index}}' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('Loop Start');
      expect(script).toContain('count');
      expect(script).toContain('for (let');
    });

    it('should compile foreach mode loop', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { value: '[1,2,3]' }),
          createNode('loop_start', 'loop_start', { loopMode: 'foreach' }),
          createNode('inner', 'template', { template: 'item: {{item}}' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
        ],
        edges: [
          createEdge('input1', 'loop_start', undefined, 'array'),
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('Loop Start');
      expect(script).toContain('foreach');
      expect(script).toContain('length');
    });

    it('should compile while_true mode loop', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'while_true', iterations: 10 }),
          createNode('inner', 'template', { template: 'checking...' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'contains', stopValue: 'DONE' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('while true');
      expect(script).toContain('max');
    });

    it('should cap iterations at 1000', () => {
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

      expect(script).toContain('1000');
      expect(script).not.toContain('999999');
    });
  });

  describe('Stop Conditions', () => {
    it('should compile contains stop condition', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('inner', 'template', { template: 'test' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'contains', stopValue: 'STOP' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('contains');
      expect(script).toContain('indexOf');
      expect(script).toContain('stop');
    });

    it('should compile equals stop condition', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('inner', 'template', { template: 'test' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'equals', stopValue: 'DONE' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('equals');
      expect(script).toContain('===');
    });

    it('should compile starts_with stop condition', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('inner', 'template', { template: 'test' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'starts_with', stopValue: 'PREFIX' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('starts_with');
      expect(script).toContain('startsWith');
    });

    it('should compile json_field stop condition', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('inner', 'template', { template: '{"status":"running"}' }),
          createNode('loop_end', 'loop_end', {
            stopCondition: 'json_field',
            stopField: 'status',
            stopValue: 'complete',
          }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('json_field');
      expect(script).toContain('JSON.parse');
      expect(script).toContain('status');
    });

    it('should compile starts_with_done stop condition', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
          createNode('inner', 'template', { template: 'test' }),
          createNode('loop_end', 'loop_end', { stopCondition: 'starts_with_done' }),
        ],
        edges: [
          createEdge('loop_start', 'inner', 'loop'),
          createEdge('inner', 'loop_end'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('starts_with_done');
      expect(script).toContain('done:');
    });
  });

  describe('Conditional Flows', () => {
    it('should compile condition node', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { value: 'test' }),
          createNode('cond1', 'condition', { operator: 'equals', compareValue: 'test' }),
          createNode('true_branch', 'template', { template: 'TRUE' }),
          createNode('false_branch', 'template', { template: 'FALSE' }),
        ],
        edges: [
          createEdge('input1', 'cond1'),
          createEdge('cond1', 'true_branch', 'true'),
          createEdge('cond1', 'false_branch', 'false'),
        ],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('cond1');
      expect(script).toContain('true_branch');
      expect(script).toContain('false_branch');
    });
  });

  describe('Input Handling', () => {
    it('should inject inputs into workflow context', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('input1', 'input_text')],
        edges: [],
      };

      const inputs = { myValue: 'Hello' };
      const script = compiler.compile(graph, inputs);

      expect(script).toContain('__inputs');
      expect(script).toContain('myValue');
      expect(script).toContain('Hello');
    });

    it('should escape special characters in inputs', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('input1', 'input_text')],
        edges: [],
      };

      const inputs = { text: 'Line1\nLine2\tTabbed' };
      const script = compiler.compile(graph, inputs);

      expect(script).toContain('\\n');
      expect(script).toContain('\\t');
    });

    it('should handle empty inputs object', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('input1', 'input_text')],
        edges: [],
      };

      const script = compiler.compile(graph, {});

      expect(script).toContain('__inputs');
    });

    it('should handle complex input objects', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('input1', 'input_text')],
        edges: [],
      };

      const inputs = {
        nested: { foo: 'bar', count: 42 },
        array: [1, 2, 3],
      };
      const script = compiler.compile(graph, inputs);

      expect(script).toContain('nested');
      expect(script).toContain('foo');
      expect(script).toContain('bar');
    });
  });

  describe('Subflow Support', () => {
    it('should compile subflow node', () => {
      const subflow: Flow = {
        id: 'subflow-1',
        name: 'My Subflow',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        graph: {
          nodes: [createNode('sub-input', 'input_text', { value: 'sub-value' })],
          edges: [],
        },
      };

      compiler.setAvailableFlows([subflow]);

      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { value: 'main' }),
          createNode('sub1', 'subflow', { flowId: 'subflow-1' }),
        ],
        edges: [createEdge('input1', 'sub1')],
      };

      const script = compiler.compile(graph);

      expect(script).toContain('sub1');
    });
  });

  describe('Edge Cases', () => {
    it('should filter out edges with non-existent nodes', () => {
      const graph: WorkflowGraph = {
        nodes: [createNode('input1', 'input_text')],
        edges: [
          createEdge('input1', 'nonexistent'),
          createEdge('ghost', 'input1'),
        ],
      };

      // Should not throw
      expect(() => compiler.compile(graph)).not.toThrow();
    });

    it('should sanitize node IDs with special characters', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('node-with-dashes', 'input_text', { value: 'test' }),
          createNode('node.with.dots', 'input_text', { value: 'test2' }),
          createNode('node@special!chars', 'input_text', { value: 'test3' }),
        ],
        edges: [],
      };

      const script = compiler.compile(graph);

      // Sanitized IDs should use underscores
      expect(script).toContain('node_with_dashes');
      expect(script).toContain('node_with_dots');
      expect(script).toContain('node_special_chars');
    });

    it('should handle unicode in node values', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createNode('input1', 'input_text', { value: '日本語テスト 🎉 émojis' }),
        ],
        edges: [],
      };

      // Should not throw
      expect(() => compiler.compile(graph)).not.toThrow();
    });

    it('should handle deeply nested graph', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create a chain of 50 nodes
      for (let i = 0; i < 50; i++) {
        nodes.push(createNode(`node${i}`, 'template', { template: `step ${i}` }));
        if (i > 0) {
          edges.push(createEdge(`node${i - 1}`, `node${i}`));
        }
      }

      const graph: WorkflowGraph = { nodes, edges };
      const script = compiler.compile(graph);

      // All nodes should be present in order
      for (let i = 0; i < 50; i++) {
        expect(script).toContain(`node${i}`);
      }
    });
  });
});

describe('Flow Cycle Detection', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  it('should detect simple cycle', () => {
    const graph: WorkflowGraph = {
      nodes: [
        createNode('a', 'template'),
        createNode('b', 'template'),
        createNode('c', 'template'),
      ],
      edges: [
        createEdge('a', 'b'),
        createEdge('b', 'c'),
        createEdge('c', 'a'), // Creates cycle
      ],
    };

    expect(() => compiler.compile(graph)).toThrow(/Circular dependency/);
  });

  it('should filter self-referencing edges and compile successfully', () => {
    const graph: WorkflowGraph = {
      nodes: [createNode('a', 'template')],
      edges: [createEdge('a', 'a')], // Self-reference (filtered out)
    };

    // Self-loop edges are silently filtered, so compilation succeeds
    const script = compiler.compile(graph);
    expect(script).toBeDefined();
  });

  it('should allow valid loop structures', () => {
    const graph: WorkflowGraph = {
      nodes: [
        createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 3 }),
        createNode('inner', 'template', { template: 'iteration' }),
        createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
      ],
      edges: [
        createEdge('loop_start', 'inner', 'loop'),
        createEdge('inner', 'loop_end'),
        createEdge('loop_end', 'loop_start'), // Valid back-edge for loops
      ],
    };

    // Should NOT throw - this is a valid loop structure
    expect(() => compiler.compile(graph)).not.toThrow();
  });

  it('should detect cycle in non-loop structures', () => {
    const graph: WorkflowGraph = {
      nodes: [
        createNode('template1', 'template'),
        createNode('template2', 'template'),
        createNode('template3', 'template'),
      ],
      edges: [
        createEdge('template1', 'template2'),
        createEdge('template2', 'template3'),
        createEdge('template3', 'template1'), // Invalid cycle (not a loop structure)
      ],
    };

    expect(() => compiler.compile(graph)).toThrow(/Circular dependency/);
  });
});

describe('Flow with Multiple Loops', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  it('should compile sequential loops', () => {
    const graph: WorkflowGraph = {
      nodes: [
        // First loop
        createNode('loop1_start', 'loop_start', { loopMode: 'count', iterations: 3 }),
        createNode('inner1', 'template', { template: 'first loop' }),
        createNode('loop1_end', 'loop_end', { stopCondition: 'none' }),
        // Second loop (after first)
        createNode('loop2_start', 'loop_start', { loopMode: 'count', iterations: 2 }),
        createNode('inner2', 'template', { template: 'second loop' }),
        createNode('loop2_end', 'loop_end', { stopCondition: 'none' }),
      ],
      edges: [
        // First loop
        createEdge('loop1_start', 'inner1', 'loop'),
        createEdge('inner1', 'loop1_end'),
        // Connect first loop to second
        createEdge('loop1_end', 'loop2_start'),
        // Second loop
        createEdge('loop2_start', 'inner2', 'loop'),
        createEdge('inner2', 'loop2_end'),
      ],
    };

    const script = compiler.compile(graph);

    expect(script).toContain('loop1_start');
    expect(script).toContain('loop1_end');
    expect(script).toContain('loop2_start');
    expect(script).toContain('loop2_end');
    expect(script).toContain('Loops found: 2');
  });

  it('should compile loops with multiple inner nodes', () => {
    const graph: WorkflowGraph = {
      nodes: [
        createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 5 }),
        createNode('inner1', 'template', { template: 'step 1' }),
        createNode('inner2', 'template', { template: 'step 2' }),
        createNode('inner3', 'template', { template: 'step 3' }),
        createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
      ],
      edges: [
        createEdge('loop_start', 'inner1', 'loop'),
        createEdge('inner1', 'inner2'),
        createEdge('inner2', 'inner3'),
        createEdge('inner3', 'loop_end'),
      ],
    };

    const script = compiler.compile(graph);

    expect(script).toContain('3 inner nodes');
    expect(script).toContain('inner1');
    expect(script).toContain('inner2');
    expect(script).toContain('inner3');
  });
});

describe('Flow Output Tests', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  it('should include workflow_context output at end', () => {
    const graph: WorkflowGraph = {
      nodes: [createNode('input1', 'input_text', { value: 'test' })],
      edges: [],
    };

    const script = compiler.compile(graph);

    // Script should end with workflow_context expression (returns the context as result)
    expect(script).toContain('workflow_context;');
  });

  it('should store node results in workflow_context', () => {
    const graph: WorkflowGraph = {
      nodes: [
        createNode('input1', 'input_text', { value: 'test' }),
        createNode('template1', 'template', { template: 'processed' }),
      ],
      edges: [createEdge('input1', 'template1')],
    };

    const script = compiler.compile(graph);

    // Each node should store its output in workflow_context
    expect(script).toContain('workflow_context["input1"]');
    expect(script).toContain('workflow_context["template1"]');
  });
});

describe('Abort Integration in Flows', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  it('should include abort checks in loops', () => {
    const graph: WorkflowGraph = {
      nodes: [
        createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 10 }),
        createNode('inner', 'template', { template: 'iteration' }),
        createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
      ],
      edges: [
        createEdge('loop_start', 'inner', 'loop'),
        createEdge('inner', 'loop_end'),
      ],
    };

    const script = compiler.compile(graph);

    expect(script).toContain('Abort.check');
    expect(script).toContain('aborted by user');
  });
});

describe('History in Loops', () => {
  let compiler: ZippCompiler;

  beforeEach(() => {
    compiler = new ZippCompiler();
  });

  it('should maintain history across loop iterations', () => {
    const graph: WorkflowGraph = {
      nodes: [
        createNode('loop_start', 'loop_start', { loopMode: 'count', iterations: 5 }),
        createNode('inner', 'template', { template: 'action {{index}}' }),
        createNode('loop_end', 'loop_end', { stopCondition: 'none' }),
      ],
      edges: [
        createEdge('loop_start', 'inner', 'loop'),
        createEdge('inner', 'loop_end'),
      ],
    };

    const script = compiler.compile(graph);

    expect(script).toContain('_history');
    expect(script).toContain('history_str');
    expect(script).toContain('Agent.set("history"');
  });
});

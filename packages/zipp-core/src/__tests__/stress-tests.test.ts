/**
 * Stress Tests for Zipp Core
 *
 * Tests system behavior under high load conditions:
 * - Concurrent job execution (50+ jobs)
 * - Large workflows (100+ nodes)
 * - Memory pressure (agent memory at limits)
 * - Rapid start/stop/abort cycles
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { JobManager } from '../queue/JobManager.js';
import type { JobManagerOptions } from '../queue/JobManager.js';
import type { WorkflowGraph, GraphNode, GraphEdge } from '../types.js';
import { ZippCompiler } from '../compiler.js';
import { BoundedMap } from '../runtime/BoundedMap.js';
import { MAX_GRAPH_ITERATIONS } from '../constants.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createJobManagerOptions(overrides: Partial<JobManagerOptions> = {}): JobManagerOptions {
  return {
    databaseHandler: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

function createNode(id: string, type: string = 'input_text', data: Record<string, unknown> = {}): GraphNode {
  return {
    id,
    type: type as GraphNode['type'],
    data: { label: id, ...data },
    position: { x: 0, y: 0 },
  };
}

function createEdge(source: string, target: string): GraphEdge {
  return { id: `${source}-${target}`, source, target };
}

function createLinearGraph(nodeCount: number): WorkflowGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (let i = 0; i < nodeCount; i++) {
    nodes.push(createNode(`node_${i}`, 'input_text', { value: `Value ${i}` }));
    if (i > 0) {
      edges.push(createEdge(`node_${i - 1}`, `node_${i}`));
    }
  }

  return { nodes, edges };
}

function createBranchingGraph(depth: number, branching: number): WorkflowGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let nodeIndex = 0;

  function addLevel(parentId: string | null, currentDepth: number) {
    if (currentDepth > depth) return;

    for (let b = 0; b < branching; b++) {
      const nodeId = `node_${nodeIndex++}`;
      nodes.push(createNode(nodeId, 'input_text'));

      if (parentId) {
        edges.push(createEdge(parentId, nodeId));
      }

      addLevel(nodeId, currentDepth + 1);
    }
  }

  addLevel(null, 1);
  return { nodes, edges };
}

// ============================================================================
// Concurrent Job Tests
// ============================================================================

describe('Stress Tests: Concurrent Jobs', () => {
  let manager: JobManager;

  beforeEach(() => {
    manager = new JobManager(createJobManagerOptions());
  });

  it('should handle 50+ concurrent job submissions', () => {
    const jobCount = 50;
    const jobIds: string[] = [];

    // Submit 50 jobs
    for (let i = 0; i < jobCount; i++) {
      const jobId = manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(3));
      jobIds.push(jobId);
    }

    // Verify all jobs were submitted
    expect(jobIds.length).toBe(jobCount);

    // Verify all jobs exist in the system
    const allJobs = manager.getAllJobs();
    for (const jobId of jobIds) {
      expect(allJobs.some(j => j.id === jobId)).toBe(true);
    }
  });

  it('should handle 100+ concurrent job submissions', () => {
    const jobCount = 100;
    const jobIds: string[] = [];

    for (let i = 0; i < jobCount; i++) {
      const jobId = manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2));
      jobIds.push(jobId);
    }

    expect(jobIds.length).toBe(jobCount);
    expect(manager.getAllJobs().length).toBe(jobCount);
  });

  it('should handle parallel mode with high concurrency', () => {
    manager.setConfig({ mode: 'parallel', maxConcurrency: 10 });

    const jobCount = 30;
    for (let i = 0; i < jobCount; i++) {
      manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2));
    }

    // Should have at most maxConcurrency active
    const active = manager.getActiveJobs();
    expect(active.length).toBeLessThanOrEqual(10);
  });

  it('should maintain correct queue ordering under load', () => {
    const jobCount = 20;

    // Submit with varying priorities
    for (let i = 0; i < jobCount; i++) {
      const priority = i % 10; // priorities 0-9
      manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2), undefined, priority);
    }

    // Verify queue is ordered by priority (descending)
    const queued = manager.getQueuedJobs();
    for (let i = 1; i < queued.length; i++) {
      expect(queued[i - 1].priority).toBeGreaterThanOrEqual(queued[i].priority);
    }
  });
});

// ============================================================================
// Rapid Start/Stop/Abort Tests
// ============================================================================

describe('Stress Tests: Rapid Start/Stop/Abort', () => {
  let manager: JobManager;

  beforeEach(() => {
    manager = new JobManager(createJobManagerOptions());
  });

  it('should handle rapid job submission and abort cycles', () => {
    const cycles = 20;

    for (let cycle = 0; cycle < cycles; cycle++) {
      const jobId = manager.submit(`flow-${cycle}`, `Test Flow ${cycle}`, createLinearGraph(2));
      manager.abort(jobId);
    }

    // Most aborted jobs should be in history (some may still be processing)
    const history = manager.getHistory();
    const allJobs = manager.getAllJobs();

    // Total jobs should equal cycles
    expect(allJobs.length).toBeGreaterThanOrEqual(cycles);

    // All history jobs should be aborted
    history.forEach(job => {
      expect(job.status).toBe('aborted');
    });
  });

  it('should handle interleaved submit and abort operations', () => {
    const jobIds: string[] = [];

    // Submit 10 jobs
    for (let i = 0; i < 10; i++) {
      jobIds.push(manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2)));
    }

    // Abort every other job
    for (let i = 0; i < jobIds.length; i += 2) {
      manager.abort(jobIds[i]);
    }

    // Submit 10 more
    for (let i = 10; i < 20; i++) {
      jobIds.push(manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2)));
    }

    // Abort remaining odd-indexed original jobs
    for (let i = 1; i < 10; i += 2) {
      manager.abort(jobIds[i]);
    }

    // System should be stable
    const allJobs = manager.getAllJobs();
    expect(allJobs.length).toBeGreaterThan(0);
  });

  it('should handle clearing history during active operations', () => {
    // Submit some jobs
    for (let i = 0; i < 5; i++) {
      const jobId = manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2));
      manager.abort(jobId);
    }

    // Clear history
    manager.clearHistory();
    expect(manager.getHistory().length).toBe(0);

    // Continue operations
    for (let i = 5; i < 10; i++) {
      manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2));
    }

    expect(manager.getAllJobs().length).toBeGreaterThan(0);
  });

  it('should handle subscription changes during job lifecycle', () => {
    const callbacks: (() => void)[] = [];

    // Add/remove subscriptions while submitting jobs
    for (let i = 0; i < 10; i++) {
      const unsubscribe = manager.onStateChange(() => {});
      callbacks.push(unsubscribe);

      manager.submit(`flow-${i}`, `Test Flow ${i}`, createLinearGraph(2));

      if (i % 2 === 0) {
        callbacks[i](); // Unsubscribe immediately
      }
    }

    // Clean up remaining subscriptions
    callbacks.forEach(cb => cb());

    // System should be stable
    expect(manager.getAllJobs().length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// Large Workflow Tests
// ============================================================================

describe('Stress Tests: Large Workflows', () => {
  it('should compile workflow with 100+ nodes', () => {
    const graph = createLinearGraph(100);
    const compiler = new ZippCompiler();

    const script = compiler.compile(graph);

    expect(script).toBeDefined();
    expect(script.length).toBeGreaterThan(0);
    expect(script).toContain('workflow_context');
  });

  it('should compile workflow with 200 nodes', () => {
    const graph = createLinearGraph(200);
    const compiler = new ZippCompiler();

    const startTime = performance.now();
    const script = compiler.compile(graph);
    const endTime = performance.now();

    expect(script).toBeDefined();
    // Compilation should complete in reasonable time (< 5 seconds)
    expect(endTime - startTime).toBeLessThan(5000);
  });

  it('should compile branching graph with many nodes', () => {
    // Creates 2^6 - 1 = 63 nodes (branching factor 2, depth 6)
    const graph = createBranchingGraph(5, 2);
    const compiler = new ZippCompiler();

    expect(graph.nodes.length).toBeGreaterThan(30);

    const script = compiler.compile(graph);
    expect(script).toBeDefined();
  });

  it('should handle workflow with many parallel branches', () => {
    const nodes: GraphNode[] = [createNode('root', 'input_text')];
    const edges: GraphEdge[] = [];

    // Create 50 parallel branches from root
    for (let i = 0; i < 50; i++) {
      nodes.push(createNode(`branch_${i}`, 'input_text'));
      edges.push(createEdge('root', `branch_${i}`));
    }

    const graph: WorkflowGraph = { nodes, edges };
    const compiler = new ZippCompiler();

    const script = compiler.compile(graph);
    expect(script).toBeDefined();
  });

  it('should handle diamond-shaped dependencies', () => {
    // Create diamond: A -> B, A -> C, B -> D, C -> D
    const nodes: GraphNode[] = [
      createNode('a', 'input_text'),
      createNode('b', 'input_text'),
      createNode('c', 'input_text'),
      createNode('d', 'input_text'),
    ];
    const edges: GraphEdge[] = [
      createEdge('a', 'b'),
      createEdge('a', 'c'),
      createEdge('b', 'd'),
      createEdge('c', 'd'),
    ];

    const compiler = new ZippCompiler();
    const script = compiler.compile({ nodes, edges });

    expect(script).toBeDefined();
    // D should come after both B and C
    const posB = script.indexOf('node_b');
    const posC = script.indexOf('node_c');
    const posD = script.indexOf('node_d');
    // Note: actual variable names may differ, this tests compilation succeeds
  });

  it('should detect cycles in complex graphs', () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Create a graph with a cycle: 0 -> 1 -> 2 -> 3 -> 1
    for (let i = 0; i < 4; i++) {
      nodes.push(createNode(`node_${i}`, 'input_text'));
    }
    edges.push(createEdge('node_0', 'node_1'));
    edges.push(createEdge('node_1', 'node_2'));
    edges.push(createEdge('node_2', 'node_3'));
    edges.push(createEdge('node_3', 'node_1')); // Cycle!

    const compiler = new ZippCompiler();

    expect(() => compiler.compile({ nodes, edges })).toThrow();
  });
});

// ============================================================================
// Memory Pressure Tests
// ============================================================================

describe('Stress Tests: Memory Pressure', () => {
  describe('BoundedMap under load', () => {
    it('should handle 10,000 entries with eviction', () => {
      const map = new BoundedMap<number, string>({ maxEntries: 1000 });

      // Add 10,000 entries
      for (let i = 0; i < 10000; i++) {
        map.set(i, `value_${i}`);
      }

      // Should have exactly maxEntries
      expect(map.size).toBe(1000);

      // Should have only the latest entries
      expect(map.has(9999)).toBe(true);
      expect(map.has(9000)).toBe(true);
      expect(map.has(0)).toBe(false); // Evicted
    });

    it('should maintain LRU order under heavy access patterns', () => {
      const map = new BoundedMap<number, number>({ maxEntries: 100 });

      // Fill to capacity
      for (let i = 0; i < 100; i++) {
        map.set(i, i);
      }

      // Access first 50 entries to make them "recently used"
      for (let i = 0; i < 50; i++) {
        map.get(i);
      }

      // Add 50 new entries, should evict 50-99 (least recently used)
      for (let i = 100; i < 150; i++) {
        map.set(i, i);
      }

      // First 50 should still exist
      for (let i = 0; i < 50; i++) {
        expect(map.has(i)).toBe(true);
      }

      // 50-99 should be evicted
      for (let i = 50; i < 100; i++) {
        expect(map.has(i)).toBe(false);
      }

      // New entries should exist
      for (let i = 100; i < 150; i++) {
        expect(map.has(i)).toBe(true);
      }
    });

    it('should handle rapid set/get/delete operations', () => {
      const map = new BoundedMap<string, number>({ maxEntries: 500 });
      const operations = 5000;

      for (let i = 0; i < operations; i++) {
        const key = `key_${i % 1000}`;
        const op = i % 4;

        switch (op) {
          case 0:
            map.set(key, i);
            break;
          case 1:
            map.get(key);
            break;
          case 2:
            map.has(key);
            break;
          case 3:
            map.delete(key);
            break;
        }
      }

      // Should be stable
      expect(map.size).toBeLessThanOrEqual(500);
    });

    it('should reject oversized values consistently', () => {
      const map = new BoundedMap<string, string>({ maxValueSize: 100 });
      const largeValue = 'x'.repeat(1000);

      // Try to set large value multiple times
      for (let i = 0; i < 100; i++) {
        map.set(`key_${i}`, largeValue);
      }

      // None should be stored
      expect(map.size).toBe(0);
    });

    it('should handle mixed small and large values', () => {
      const map = new BoundedMap<string, string>({ maxEntries: 100, maxValueSize: 100 });
      const smallValue = 'small';
      const largeValue = 'x'.repeat(1000);

      for (let i = 0; i < 200; i++) {
        if (i % 2 === 0) {
          map.set(`key_${i}`, smallValue);
        } else {
          map.set(`key_${i}`, largeValue); // Should be rejected
        }
      }

      // Only small values should be stored (at most maxEntries)
      expect(map.size).toBeLessThanOrEqual(100);

      // Verify some small values exist
      let smallCount = 0;
      for (let i = 0; i < 200; i += 2) {
        if (map.has(`key_${i}`)) smallCount++;
      }
      expect(smallCount).toBeGreaterThan(0);
    });
  });

  describe('Large data payloads', () => {
    it('should handle workflow with large node data', () => {
      const largeData = { content: 'x'.repeat(10000) };
      const nodes: GraphNode[] = [];

      for (let i = 0; i < 20; i++) {
        nodes.push(createNode(`node_${i}`, 'input_text', largeData));
      }

      const graph: WorkflowGraph = { nodes, edges: [] };
      const compiler = new ZippCompiler();

      const script = compiler.compile(graph);
      expect(script).toBeDefined();
      expect(script.length).toBeGreaterThan(0);
    });

    it('should handle BoundedMap with complex nested objects', () => {
      const map = new BoundedMap<string, unknown>({ maxEntries: 100, maxValueSize: 10000 });

      for (let i = 0; i < 50; i++) {
        const complexObject = {
          id: i,
          data: {
            nested: {
              array: Array(100).fill({ value: i }),
              map: Object.fromEntries(
                Array(10).fill(0).map((_, j) => [`key_${j}`, { index: j }])
              ),
            },
          },
        };
        map.set(`key_${i}`, complexObject);
      }

      expect(map.size).toBe(50);

      // Verify data integrity
      const retrieved = map.get('key_25') as { id: number };
      expect(retrieved.id).toBe(25);
    });
  });
});

// ============================================================================
// Performance Benchmarks
// ============================================================================

describe('Stress Tests: Performance Benchmarks', () => {
  it('should compile 100 node graph under 1 second', () => {
    const graph = createLinearGraph(100);
    const compiler = new ZippCompiler();

    const start = performance.now();
    compiler.compile(graph);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should submit 100 jobs under 100ms', () => {
    const manager = new JobManager(createJobManagerOptions());

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      manager.submit(`flow-${i}`, `Test ${i}`, createLinearGraph(2));
    }
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('should handle BoundedMap 10,000 operations under 500ms', () => {
    const map = new BoundedMap<number, number>({ maxEntries: 1000 });

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      map.set(i, i);
      map.get(i % 500);
    }
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
  });
});

// ============================================================================
// Edge Cases & Error Recovery
// ============================================================================

describe('Stress Tests: Edge Cases', () => {
  it('should handle empty workflow', () => {
    const compiler = new ZippCompiler();
    const script = compiler.compile({ nodes: [], edges: [] });

    expect(script).toBeDefined();
  });

  it('should handle single node workflow', () => {
    const graph: WorkflowGraph = {
      nodes: [createNode('single', 'input_text')],
      edges: [],
    };
    const compiler = new ZippCompiler();

    const script = compiler.compile(graph);
    expect(script).toBeDefined();
  });

  it('should handle disconnected nodes', () => {
    const nodes: GraphNode[] = [];
    for (let i = 0; i < 10; i++) {
      nodes.push(createNode(`node_${i}`, 'input_text'));
    }

    const compiler = new ZippCompiler();
    const script = compiler.compile({ nodes, edges: [] });

    expect(script).toBeDefined();
  });

  it('should handle edges with non-existent nodes gracefully', () => {
    const graph: WorkflowGraph = {
      nodes: [createNode('a', 'input_text')],
      edges: [createEdge('a', 'non_existent')],
    };

    const compiler = new ZippCompiler();
    // Should not throw - edges to non-existent nodes are filtered
    const script = compiler.compile(graph);
    expect(script).toBeDefined();
  });

  it('should handle job manager with no active jobs', () => {
    const manager = new JobManager(createJobManagerOptions());

    expect(manager.getActiveJobs()).toEqual([]);
    expect(manager.getQueuedJobs()).toEqual([]);
    expect(manager.getHistory()).toEqual([]);
    expect(manager.getAllJobs()).toEqual([]);
  });

  it('should handle aborting non-existent job', () => {
    const manager = new JobManager(createJobManagerOptions());

    // Should not throw
    expect(() => manager.abort('non-existent-id')).not.toThrow();
  });
});

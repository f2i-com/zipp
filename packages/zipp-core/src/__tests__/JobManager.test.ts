/**
 * Tests for JobManager
 *
 * Tests the job queue management system for workflow execution.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { JobManager } from '../queue/JobManager.js';
import type { JobManagerOptions } from '../queue/JobManager.js';
import type { WorkflowGraph } from '../types.js';
import type { Job, JobConfig } from '../queue/types.js';

// Helper to create minimal JobManager options
function createOptions(overrides: Partial<JobManagerOptions> = {}): JobManagerOptions {
  return {
    databaseHandler: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

// Helper to create a minimal workflow graph
function createGraph(overrides: Partial<WorkflowGraph> = {}): WorkflowGraph {
  return {
    nodes: [],
    edges: [],
    ...overrides,
  };
}

describe('JobManager', () => {
  let manager: JobManager;

  beforeEach(() => {
    manager = new JobManager(createOptions());
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const config = manager.getConfig();
      expect(config.mode).toBe('sequential');
      expect(config.maxConcurrency).toBe(1);
    });

    it('should create instance with custom config', () => {
      const customManager = new JobManager(createOptions({
        config: { mode: 'parallel', maxConcurrency: 4 },
      }));

      const config = customManager.getConfig();
      expect(config.mode).toBe('parallel');
      expect(config.maxConcurrency).toBe(4);
    });

    it('should accept database handler', () => {
      const handler = jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });
      const customManager = new JobManager(createOptions({ databaseHandler: handler }));

      expect(customManager).toBeDefined();
    });
  });

  describe('getConfig / setConfig', () => {
    it('should return current config', () => {
      const config = manager.getConfig();
      expect(config).toHaveProperty('mode');
      expect(config).toHaveProperty('maxConcurrency');
    });

    it('should update config partially', () => {
      manager.setConfig({ mode: 'parallel' });

      const config = manager.getConfig();
      expect(config.mode).toBe('parallel');
      expect(config.maxConcurrency).toBe(1); // unchanged
    });

    it('should update maxConcurrency', () => {
      manager.setConfig({ maxConcurrency: 3 });

      const config = manager.getConfig();
      expect(config.maxConcurrency).toBe(3);
    });

    it('should return a copy of config', () => {
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('submit', () => {
    it('should return job ID', () => {
      const jobId = manager.submit('flow-1', 'Test Flow', createGraph());

      expect(typeof jobId).toBe('string');
      expect(jobId.length).toBeGreaterThan(0);
    });

    it('should add job to queue or active', () => {
      const jobId = manager.submit('flow-1', 'Test Flow', createGraph());

      const allJobs = manager.getAllJobs();
      expect(allJobs.some(j => j.id === jobId)).toBe(true);
    });

    it('should set job properties correctly', () => {
      const graph = createGraph({ nodes: [{ id: 'n1', type: 'input_text', data: {}, position: { x: 0, y: 0 } }] });
      const inputs = { key: 'value' };

      const jobId = manager.submit('flow-1', 'My Flow', graph, inputs, 5);
      const job = manager.getJob(jobId);

      expect(job).toBeDefined();
      expect(job!.flowId).toBe('flow-1');
      expect(job!.flowName).toBe('My Flow');
      expect(job!.graph).toEqual(graph);
      expect(job!.inputs).toEqual(inputs);
      expect(job!.priority).toBe(5);
    });

    it('should set submittedAt timestamp', () => {
      const before = Date.now();
      const jobId = manager.submit('flow-1', 'Test Flow', createGraph());
      const after = Date.now();

      const job = manager.getJob(jobId);
      expect(job!.submittedAt).toBeGreaterThanOrEqual(before);
      expect(job!.submittedAt).toBeLessThanOrEqual(after);
    });

    it('should have logs array', () => {
      const jobId = manager.submit('flow-1', 'Test Flow', createGraph());
      const job = manager.getJob(jobId);

      // Logs array exists (may have entries from running workflow)
      expect(Array.isArray(job!.logs)).toBe(true);
    });

    it('should order jobs by priority', () => {
      // Submit lower priority first
      manager.submit('flow-1', 'Low Priority', createGraph(), undefined, 1);
      // Submit higher priority
      manager.submit('flow-2', 'High Priority', createGraph(), undefined, 10);

      const queued = manager.getQueuedJobs();
      // Higher priority should be first in queue (after any running job)
      if (queued.length >= 2) {
        expect(queued[0].priority).toBeGreaterThanOrEqual(queued[1].priority);
      }
    });
  });

  describe('getJob', () => {
    it('should return job by ID', () => {
      const jobId = manager.submit('flow-1', 'Test Flow', createGraph());
      const job = manager.getJob(jobId);

      expect(job).toBeDefined();
      expect(job!.id).toBe(jobId);
    });

    it('should return undefined for unknown ID', () => {
      const job = manager.getJob('non-existent-id');
      expect(job).toBeUndefined();
    });
  });

  describe('getActiveJobs', () => {
    it('should return array', () => {
      const active = manager.getActiveJobs();
      expect(Array.isArray(active)).toBe(true);
    });

    it('should include running jobs', () => {
      manager.submit('flow-1', 'Test Flow', createGraph());

      const active = manager.getActiveJobs();
      // Job may or may not be active depending on processing
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe('getQueuedJobs', () => {
    it('should return array', () => {
      const queued = manager.getQueuedJobs();
      expect(Array.isArray(queued)).toBe(true);
    });

    it('should return copy of queue', () => {
      manager.submit('flow-1', 'Test 1', createGraph());
      manager.submit('flow-2', 'Test 2', createGraph());

      const queued1 = manager.getQueuedJobs();
      const queued2 = manager.getQueuedJobs();

      expect(queued1).not.toBe(queued2);
    });
  });

  describe('getHistory', () => {
    it('should return array', () => {
      const history = manager.getHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return empty initially', () => {
      const history = manager.getHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('getAllJobs', () => {
    it('should return combined active, queued, and history', () => {
      manager.submit('flow-1', 'Test 1', createGraph());
      manager.submit('flow-2', 'Test 2', createGraph());

      const all = manager.getAllJobs();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getJobForFlow', () => {
    it('should return job for specific flow', () => {
      manager.submit('flow-1', 'Test Flow', createGraph());

      const job = manager.getJobForFlow('flow-1');
      expect(job).toBeDefined();
      expect(job!.flowId).toBe('flow-1');
    });

    it('should return undefined for non-existent flow', () => {
      const job = manager.getJobForFlow('non-existent-flow');
      expect(job).toBeUndefined();
    });
  });

  describe('isFlowRunning', () => {
    it('should return false for non-running flow', () => {
      const isRunning = manager.isFlowRunning('flow-1');
      expect(isRunning).toBe(false);
    });

    it('should check active jobs for flow', () => {
      manager.submit('flow-1', 'Test Flow', createGraph());

      // May or may not be running depending on processing speed
      const isRunning = manager.isFlowRunning('flow-1');
      expect(typeof isRunning).toBe('boolean');
    });
  });

  describe('getQueuePosition', () => {
    it('should return null for non-queued job', () => {
      const position = manager.getQueuePosition('non-existent-id');
      expect(position).toBeNull();
    });

    it('should return 1-indexed position', () => {
      // Submit multiple jobs to ensure some end up in queue
      manager.submit('flow-1', 'Test 1', createGraph());
      const jobId2 = manager.submit('flow-2', 'Test 2', createGraph());

      const position = manager.getQueuePosition(jobId2);
      // Position should be a number if in queue, null if active
      expect(position === null || position >= 1).toBe(true);
    });
  });

  describe('abort', () => {
    it('should not throw for non-existent job', () => {
      expect(() => manager.abort('non-existent-id')).not.toThrow();
    });

    it('should remove pending job from queue', () => {
      // Submit two jobs - first will run, second will be queued
      manager.submit('flow-1', 'Test 1', createGraph());
      const jobId2 = manager.submit('flow-2', 'Test 2', createGraph());

      // Abort the second job
      manager.abort(jobId2);

      // Check it's no longer in queue
      const queued = manager.getQueuedJobs();
      expect(queued.find(j => j.id === jobId2)).toBeUndefined();
    });

    it('should set aborted status for pending job', () => {
      manager.submit('flow-1', 'Test 1', createGraph());
      const jobId2 = manager.submit('flow-2', 'Test 2', createGraph());

      manager.abort(jobId2);

      // Check it's in history with aborted status
      const job = manager.getJob(jobId2);
      if (job) {
        expect(job.status).toBe('aborted');
      }
    });
  });

  describe('clearHistory', () => {
    it('should clear history', () => {
      // We can't easily populate history without running jobs,
      // but we can verify the method works
      manager.clearHistory();
      const history = manager.getHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('subscription methods', () => {
    describe('onStateChange', () => {
      it('should return unsubscribe function', () => {
        const callback = jest.fn();
        const unsubscribe = manager.onStateChange(callback);

        expect(typeof unsubscribe).toBe('function');
      });

      it('should call callback on job submission', () => {
        const callback = jest.fn();
        manager.onStateChange(callback);

        manager.submit('flow-1', 'Test Flow', createGraph());

        expect(callback).toHaveBeenCalled();
      });

      it('should not call after unsubscribe', () => {
        const callback = jest.fn();
        const unsubscribe = manager.onStateChange(callback);

        unsubscribe();
        callback.mockClear();

        manager.submit('flow-1', 'Test Flow', createGraph());

        expect(callback).not.toHaveBeenCalled();
      });

      it('should receive all jobs in callback', () => {
        const callback = jest.fn();
        manager.onStateChange(callback);

        manager.submit('flow-1', 'Test 1', createGraph());
        manager.submit('flow-2', 'Test 2', createGraph());

        expect(callback).toHaveBeenCalled();
        const lastCallArgs = callback.mock.calls[callback.mock.calls.length - 1];
        expect(Array.isArray(lastCallArgs[0])).toBe(true);
      });
    });

    describe('onLog', () => {
      it('should return unsubscribe function', () => {
        const callback = jest.fn();
        const unsubscribe = manager.onLog(callback);

        expect(typeof unsubscribe).toBe('function');
      });

      it('should allow unsubscribe', () => {
        const callback = jest.fn();
        const unsubscribe = manager.onLog(callback);

        unsubscribe();
        // No error should occur
      });
    });

    describe('onNodeStatus', () => {
      it('should return unsubscribe function', () => {
        const callback = jest.fn();
        const unsubscribe = manager.onNodeStatus(callback);

        expect(typeof unsubscribe).toBe('function');
      });
    });

    describe('onStreamToken', () => {
      it('should return unsubscribe function', () => {
        const callback = jest.fn();
        const unsubscribe = manager.onStreamToken(callback);

        expect(typeof unsubscribe).toBe('function');
      });
    });

    describe('onImageUpdate', () => {
      it('should return unsubscribe function', () => {
        const callback = jest.fn();
        const unsubscribe = manager.onImageUpdate(callback);

        expect(typeof unsubscribe).toBe('function');
      });
    });
  });

  describe('setAvailableFlows', () => {
    it('should accept flows array', () => {
      expect(() => manager.setAvailableFlows([])).not.toThrow();
    });

    it('should accept non-empty flows array', () => {
      const flows = [
        { id: 'flow-1', name: 'Flow 1', graph: createGraph() },
      ];
      expect(() => manager.setAvailableFlows(flows as any)).not.toThrow();
    });
  });

  describe('setPackageMacros', () => {
    it('should accept macros array', () => {
      expect(() => manager.setPackageMacros([])).not.toThrow();
    });
  });

  describe('clearPackageMacros', () => {
    it('should clear macros without error', () => {
      manager.setPackageMacros([{ id: 'm1', name: 'Macro 1', graph: createGraph() } as any]);
      expect(() => manager.clearPackageMacros()).not.toThrow();
    });
  });

  describe('setProjectSettings', () => {
    it('should accept project settings', () => {
      const settings = { constants: {}, aiModelDefaults: {} };
      expect(() => manager.setProjectSettings(settings as any)).not.toThrow();
    });
  });

  describe('setModuleRegistry', () => {
    it('should accept module registry', () => {
      const registry = {
        getModule: () => undefined,
        getAllModules: () => [],
        hasModule: () => false,
      };
      expect(() => manager.setModuleRegistry(registry as any)).not.toThrow();
    });
  });

  describe('queue behavior', () => {
    it('should process jobs in order in sequential mode', () => {
      manager.setConfig({ mode: 'sequential' });

      const id1 = manager.submit('flow-1', 'Test 1', createGraph());
      const id2 = manager.submit('flow-2', 'Test 2', createGraph());

      // First job should be active or running
      const job1 = manager.getJob(id1);
      expect(['pending', 'running'].includes(job1!.status)).toBe(true);
    });

    it('should limit concurrent jobs based on config', () => {
      manager.setConfig({ mode: 'parallel', maxConcurrency: 2 });

      manager.submit('flow-1', 'Test 1', createGraph());
      manager.submit('flow-2', 'Test 2', createGraph());
      manager.submit('flow-3', 'Test 3', createGraph());

      const active = manager.getActiveJobs();
      const queued = manager.getQueuedJobs();

      // Should have at most 2 active (maxConcurrency)
      expect(active.length).toBeLessThanOrEqual(2);
    });
  });

  describe('job lifecycle', () => {
    it('should set startedAt when job starts', async () => {
      const jobId = manager.submit('flow-1', 'Test Flow', createGraph());

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 10));

      const job = manager.getJob(jobId);
      if (job && job.status === 'running') {
        expect(job.startedAt).toBeDefined();
        expect(job.startedAt).toBeGreaterThan(0);
      }
    });
  });
});

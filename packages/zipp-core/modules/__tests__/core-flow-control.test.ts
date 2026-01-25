/**
 * Tests for Core Flow Control Module Runtime
 *
 * Tests subflow execution, macro execution, recursion prevention, and abort handling.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreFlowControlRuntime from '../core-flow-control/runtime.js';

describe('CoreFlowControlRuntime', () => {
  beforeEach(async () => {
    // Reset the module state before each test
    await CoreFlowControlRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreFlowControlRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('execute (subflow)', () => {
    it('should execute a subflow and return result', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        runSubflowResult: { output: 'subflow result' },
      });
      await CoreFlowControlRuntime.init?.(context);

      const result = await CoreFlowControlRuntime.methods.execute(
        'flow-123',
        { input: 'test data' },
        'node-1'
      );

      expect(result).toEqual({ output: 'subflow result' });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'running' });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Running flow: flow-123'))).toBe(true);
      expect(logs.some((l) => l.message.includes('Completed: flow-123'))).toBe(true);
    });

    it('should convert non-object input to { input: value }', async () => {
      let capturedInputs: Record<string, unknown> = {};
      const { context } = createMockRuntimeContext();
      context.runSubflow = async (_flowId, inputs) => {
        capturedInputs = inputs;
        return { success: true };
      };
      await CoreFlowControlRuntime.init?.(context);

      await CoreFlowControlRuntime.methods.execute('flow-123', 'plain string', 'node-1');

      expect(capturedInputs).toEqual({ input: 'plain string' });
    });

    it('should return error message when runSubflow is not configured', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      context.runSubflow = undefined;
      await CoreFlowControlRuntime.init?.(context);

      const result = await CoreFlowControlRuntime.methods.execute('flow-123', {}, 'node-1');

      expect(result).toBe('Error: No subflow callback configured');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.level === 'error')).toBe(true);
    });

    it('should detect recursive subflow and throw error', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      // Make runSubflow call execute again with same flow ID
      context.runSubflow = async () => {
        return await CoreFlowControlRuntime.methods.execute('flow-recursive', {}, 'node-2');
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.execute('flow-recursive', {}, 'node-1')
      ).rejects.toThrow('Recursive subflow detected: flow-recursive');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-2', status: 'error' });
    });

    it('should throw error when max recursion depth exceeded', async () => {
      const { context } = createMockRuntimeContext();
      let depth = 0;
      context.runSubflow = async () => {
        depth++;
        return await CoreFlowControlRuntime.methods.execute(`flow-${depth}`, {}, `node-${depth}`);
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.execute('flow-0', {}, 'node-0')
      ).rejects.toThrow('Maximum subflow depth (10) exceeded');
    });

    it('should handle subflow execution errors', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      context.runSubflow = async () => {
        throw new Error('Subflow execution failed');
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.execute('flow-123', {}, 'node-1')
      ).rejects.toThrow('Subflow execution failed');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.message.includes('Failed: Subflow execution failed'))).toBe(true);
    });
  });

  describe('executeMacro', () => {
    it('should execute a macro workflow and return outputs', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      context.runSubflow = async () => ({
        __macro_outputs__: { result: 'macro output' },
      });
      await CoreFlowControlRuntime.init?.(context);

      const result = await CoreFlowControlRuntime.methods.executeMacro(
        'macro-123',
        { input1: 'value1' },
        'node-1'
      );

      expect(result).toEqual({ result: 'macro output' });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'running' });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Running macro workflow: macro-123'))).toBe(true);
    });

    it('should pass inputs as __macro_inputs__', async () => {
      const { context } = createMockRuntimeContext();
      let capturedContext: Record<string, unknown> = {};
      context.runSubflow = async (_flowId, inputs) => {
        capturedContext = inputs;
        return {};
      };
      await CoreFlowControlRuntime.init?.(context);

      await CoreFlowControlRuntime.methods.executeMacro(
        'macro-123',
        { foo: 'bar', count: 42 },
        'node-1'
      );

      expect(capturedContext).toEqual({
        __macro_inputs__: { foo: 'bar', count: 42 },
      });
    });

    it('should return raw result if __macro_outputs__ is missing', async () => {
      const { context } = createMockRuntimeContext();
      context.runSubflow = async () => ({ directOutput: 'value' });
      await CoreFlowControlRuntime.init?.(context);

      const result = await CoreFlowControlRuntime.methods.executeMacro(
        'macro-123',
        {},
        'node-1'
      );

      expect(result).toEqual({ directOutput: 'value' });
    });

    it('should throw error when runSubflow is not configured', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      context.runSubflow = undefined;
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.executeMacro('macro-123', {}, 'node-1')
      ).rejects.toThrow('No subflow callback configured');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should detect recursive macro and throw error', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      context.runSubflow = async () => {
        return await CoreFlowControlRuntime.methods.executeMacro('macro-recursive', {}, 'node-2');
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.executeMacro('macro-recursive', {}, 'node-1')
      ).rejects.toThrow('Recursive macro detected: macro-recursive');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-2', status: 'error' });
    });

    it('should throw error when max macro depth exceeded', async () => {
      const { context } = createMockRuntimeContext();
      let depth = 0;
      context.runSubflow = async () => {
        depth++;
        return await CoreFlowControlRuntime.methods.executeMacro(`macro-${depth}`, {}, `node-${depth}`);
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.executeMacro('macro-0', {}, 'node-0')
      ).rejects.toThrow('Maximum macro depth (10) exceeded');
    });

    it('should handle macro execution errors', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      context.runSubflow = async () => {
        throw new Error('Macro execution failed');
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.executeMacro('macro-123', {}, 'node-1')
      ).rejects.toThrow('Macro execution failed');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.message.includes('Failed: Macro execution failed'))).toBe(true);
    });
  });

  describe('checkAborted', () => {
    it('should return false when no abort signal', async () => {
      const { context } = createMockRuntimeContext();
      await CoreFlowControlRuntime.init?.(context);

      const result = CoreFlowControlRuntime.methods.checkAborted();

      expect(result).toBe(false);
    });

    it('should return false when abort signal is not aborted', async () => {
      const controller = new AbortController();
      const { context } = createMockRuntimeContext({
        abortSignal: controller.signal,
      });
      await CoreFlowControlRuntime.init?.(context);

      const result = CoreFlowControlRuntime.methods.checkAborted();

      expect(result).toBe(false);
    });

    it('should return true when abort signal is aborted', async () => {
      const controller = new AbortController();
      const { context } = createMockRuntimeContext({
        abortSignal: controller.signal,
      });
      await CoreFlowControlRuntime.init?.(context);
      controller.abort();

      const result = CoreFlowControlRuntime.methods.checkAborted();

      expect(result).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clear call stack on cleanup', async () => {
      const { context } = createMockRuntimeContext();
      context.runSubflow = async () => ({ success: true });
      await CoreFlowControlRuntime.init?.(context);

      // Execute a subflow (adds to call stack)
      await CoreFlowControlRuntime.methods.execute('flow-1', {}, 'node-1');

      // Cleanup
      await CoreFlowControlRuntime.cleanup?.();

      // After cleanup, should be able to use same flow ID again
      const { context: context2 } = createMockRuntimeContext();
      context2.runSubflow = async () => ({ success: true });
      await CoreFlowControlRuntime.init?.(context2);

      // This would fail with recursion error if stack wasn't cleared
      const result = await CoreFlowControlRuntime.methods.execute('flow-1', {}, 'node-2');
      expect(result).toEqual({ success: true });
    });
  });
});

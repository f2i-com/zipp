/**
 * Integration Tests for Workflow Patterns
 *
 * Tests common workflow patterns: linear flows, conditions, loops, macros.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext } from '../helpers/mockRuntimeContext.js';
import { createNode, createEdge, resetIdCounters } from '../helpers/testFactories.js';

// Import modules for integration testing
import CoreFlowControlRuntime from '../../../modules/core-flow-control/runtime.js';
import CoreUtilityRuntime from '../../../modules/core-utility/runtime.js';

describe('Workflow Integration Patterns', () => {
  beforeEach(async () => {
    resetIdCounters();
    await CoreFlowControlRuntime.cleanup?.();
    await CoreUtilityRuntime.cleanup?.();
  });

  describe('Linear Workflow', () => {
    it('should process data through template substitution', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      // Simulate: input -> template -> output
      const inputValue = 'World';
      const templateStr = 'Hello, {{name}}!';

      const result = CoreUtilityRuntime.methods.template(templateStr, { name: inputValue });

      expect(result).toBe('Hello, World!');
    });

    it('should chain multiple template substitutions', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      // First template
      const step1 = CoreUtilityRuntime.methods.template('Name: {{name}}', { name: 'John' });

      // Second template uses output from first
      const step2 = CoreUtilityRuntime.methods.template('{{previous}} Age: {{age}}', {
        previous: step1,
        age: 30,
      });

      expect(step2).toBe('Name: John Age: 30');
    });
  });

  describe('Memory Operations', () => {
    it('should store and retrieve values across operations', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      // Store values
      CoreUtilityRuntime.methods.memoryWrite('counter', 0);
      CoreUtilityRuntime.methods.memoryWrite('items', ['a', 'b', 'c']);

      // Retrieve and verify
      expect(CoreUtilityRuntime.methods.memoryRead('counter')).toBe(0);
      expect(CoreUtilityRuntime.methods.memoryRead('items')).toEqual(['a', 'b', 'c']);

      // Update counter
      const current = CoreUtilityRuntime.methods.memoryRead('counter') as number;
      CoreUtilityRuntime.methods.memoryWrite('counter', current + 1);

      expect(CoreUtilityRuntime.methods.memoryRead('counter')).toBe(1);
    });

    it('should handle memory clear between workflows', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      CoreUtilityRuntime.methods.memoryWrite('key1', 'value1');
      CoreUtilityRuntime.methods.memoryWrite('key2', 'value2');

      CoreUtilityRuntime.methods.memoryClear();

      expect(CoreUtilityRuntime.methods.memoryRead('key1')).toBeUndefined();
      expect(CoreUtilityRuntime.methods.memoryRead('key2')).toBeUndefined();
    });
  });

  describe('Logic Block Execution', () => {
    it('should execute logic with multiple inputs', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.logicBlock(
        'return items.map(x => x * multiplier);',
        { items: [1, 2, 3, 4, 5], multiplier: 2 }
      );

      expect(result).toEqual([2, 4, 6, 8, 10]);
    });

    it('should handle complex data transformations', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const inputData = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 },
      ];

      const result = CoreUtilityRuntime.methods.logicBlock(
        `
        const filtered = data.filter(p => p.age >= minAge);
        const sorted = filtered.sort((a, b) => a.age - b.age);
        return sorted.map(p => p.name);
        `,
        { data: inputData, minAge: 28 }
      );

      expect(result).toEqual(['Alice', 'Charlie']);
    });
  });

  describe('Subflow Execution', () => {
    it('should execute subflow and return result', async () => {
      const { context, logs } = createMockRuntimeContext({
        runSubflowResult: { output: 'subflow completed successfully' },
      });
      await CoreFlowControlRuntime.init?.(context);

      const result = await CoreFlowControlRuntime.methods.execute(
        'subflow-123',
        { input: 'test data' },
        'node-1'
      );

      expect(result).toEqual({ output: 'subflow completed successfully' });
      expect(logs.some((l) => l.message.includes('Running flow'))).toBe(true);
      expect(logs.some((l) => l.message.includes('Completed'))).toBe(true);
    });

    it('should prevent infinite recursion', async () => {
      const { context } = createMockRuntimeContext();

      // Make runSubflow call execute again with same flow ID
      context.runSubflow = async () => {
        return await CoreFlowControlRuntime.methods.execute('recursive-flow', {}, 'node-2');
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.execute('recursive-flow', {}, 'node-1')
      ).rejects.toThrow('Recursive subflow detected');
    });
  });

  describe('Macro Execution', () => {
    it('should execute macro with input mapping', async () => {
      const { context, logs } = createMockRuntimeContext();

      let capturedInputs: Record<string, unknown> = {};
      context.runSubflow = async (_flowId, inputs) => {
        capturedInputs = inputs;
        return {
          __macro_outputs__: {
            result: 'processed: ' + (inputs.__macro_inputs__ as Record<string, unknown>)?.data,
          },
        };
      };
      await CoreFlowControlRuntime.init?.(context);

      const result = await CoreFlowControlRuntime.methods.executeMacro(
        'macro-123',
        { data: 'input value' },
        'node-1'
      );

      expect(capturedInputs.__macro_inputs__).toEqual({ data: 'input value' });
      expect(result).toEqual({ result: 'processed: input value' });
      expect(logs.some((l) => l.message.includes('Running macro workflow'))).toBe(true);
    });

    it('should prevent macro infinite recursion', async () => {
      const { context } = createMockRuntimeContext();

      context.runSubflow = async () => {
        return await CoreFlowControlRuntime.methods.executeMacro('recursive-macro', {}, 'node-2');
      };
      await CoreFlowControlRuntime.init?.(context);

      await expect(
        CoreFlowControlRuntime.methods.executeMacro('recursive-macro', {}, 'node-1')
      ).rejects.toThrow('Recursive macro detected');
    });

    it('should enforce max recursion depth', async () => {
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
  });

  describe('Abort Signal Handling', () => {
    it('should check abort signal status', async () => {
      const controller = new AbortController();
      const { context } = createMockRuntimeContext({
        abortSignal: controller.signal,
      });
      await CoreFlowControlRuntime.init?.(context);

      expect(CoreFlowControlRuntime.methods.checkAborted()).toBe(false);

      controller.abort();

      expect(CoreFlowControlRuntime.methods.checkAborted()).toBe(true);
    });
  });

  describe('Combined Workflow Patterns', () => {
    it('should combine memory with template processing', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      // Store user data
      CoreUtilityRuntime.methods.memoryWrite('user', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      });

      // Retrieve and use in template
      const userData = CoreUtilityRuntime.methods.memoryRead('user') as Record<string, string>;
      const message = CoreUtilityRuntime.methods.template(
        'Dear {{firstName}} {{lastName}}, your email {{email}} has been verified.',
        userData
      );

      expect(message).toBe('Dear John Doe, your email john@example.com has been verified.');
    });

    it('should process array data with logic and template', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      // Process array with logic block
      const processed = CoreUtilityRuntime.methods.logicBlock(
        `return items.map((item, i) => ({ index: i + 1, value: item.toUpperCase() }));`,
        { items: ['apple', 'banana', 'cherry'] }
      ) as Array<{ index: number; value: string }>;

      // Generate output with template for each item
      const outputs: string[] = [];
      for (const item of processed) {
        outputs.push(
          CoreUtilityRuntime.methods.template('{{index}}. {{value}}', item)
        );
      }

      expect(outputs).toEqual(['1. APPLE', '2. BANANA', '3. CHERRY']);
    });
  });
});

/**
 * Tests for Core Utility Module Runtime
 *
 * Tests template processing, logic blocks, memory operations, HTTP requests.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockFetchResponse } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreUtilityRuntime from '../core-utility/runtime.js';

describe('CoreUtilityRuntime', () => {
  beforeEach(async () => {
    await CoreUtilityRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('template', () => {
    it('should substitute simple variables', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.template(
        'Hello, {{name}}!',
        { name: 'World' }
      );

      expect(result).toBe('Hello, World!');
    });

    it('should substitute multiple variables', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.template(
        '{{greeting}}, {{name}}! You have {{count}} messages.',
        { greeting: 'Hi', name: 'User', count: 5 }
      );

      expect(result).toBe('Hi, User! You have 5 messages.');
    });

    it('should substitute same variable multiple times', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.template(
        '{{word}} {{word}} {{word}}',
        { word: 'echo' }
      );

      expect(result).toBe('echo echo echo');
    });

    it('should handle object values by JSON stringifying', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.template(
        'Data: {{data}}',
        { data: { key: 'value', num: 42 } }
      );

      expect(result).toBe('Data: {"key":"value","num":42}');
    });

    it('should leave unmatched placeholders unchanged', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.template(
        'Hello, {{name}}! {{unknown}}',
        { name: 'World' }
      );

      expect(result).toBe('Hello, World! {{unknown}}');
    });

    it('should handle empty template', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.template('', { name: 'World' });

      expect(result).toBe('');
    });
  });

  describe('logicBlock', () => {
    it('should execute simple return statement', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.logicBlock(
        'return 42;',
        {}
      );

      expect(result).toBe(42);
    });

    it('should access input variables', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.logicBlock(
        'return a + b;',
        { a: 10, b: 20 }
      );

      expect(result).toBe(30);
    });

    it('should handle string operations', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.logicBlock(
        'return text.toUpperCase();',
        { text: 'hello' }
      );

      expect(result).toBe('HELLO');
    });

    it('should handle array operations', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.logicBlock(
        'return items.filter(x => x > 2);',
        { items: [1, 2, 3, 4, 5] }
      );

      expect(result).toEqual([3, 4, 5]);
    });

    it('should handle object operations', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.logicBlock(
        'return { ...obj, added: true };',
        { obj: { original: 'value' } }
      );

      expect(result).toEqual({ original: 'value', added: true });
    });

    it('should reject non-string code', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      expect(() =>
        CoreUtilityRuntime.methods.logicBlock(42 as unknown as string, {})
      ).toThrow('LogicBlock code must be a string');
    });

    it('should reject code exceeding max length', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const longCode = 'x'.repeat(1024 * 1024 + 1);
      expect(() =>
        CoreUtilityRuntime.methods.logicBlock(longCode, {})
      ).toThrow('exceeds maximum length');
    });

    it('should reject invalid input names', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      expect(() =>
        CoreUtilityRuntime.methods.logicBlock('return x;', { '123invalid': 'value' })
      ).toThrow('Invalid input name');
    });

    it('should reject reserved input names', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const reserved = ['eval', 'Function', 'constructor', '__proto__', 'prototype'];
      for (const name of reserved) {
        expect(() =>
          CoreUtilityRuntime.methods.logicBlock('return x;', { [name]: 'value' })
        ).toThrow(`Reserved input name not allowed: "${name}"`);
      }
    });

    it('should handle execution errors', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      expect(() =>
        CoreUtilityRuntime.methods.logicBlock('return nonExistent.property;', {})
      ).toThrow();
      expect(logs.some((l) => l.level === 'error')).toBe(true);
    });
  });

  describe('memory operations', () => {
    it('should write and read from memory', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      CoreUtilityRuntime.methods.memoryWrite('testKey', 'testValue');
      const result = CoreUtilityRuntime.methods.memoryRead('testKey');

      expect(result).toBe('testValue');
    });

    it('should return default value for non-existent key', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.memoryRead('nonExistent', 'default');

      expect(result).toBe('default');
    });

    it('should return undefined for non-existent key without default', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const result = CoreUtilityRuntime.methods.memoryRead('nonExistent');

      expect(result).toBeUndefined();
    });

    it('should overwrite existing values', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      CoreUtilityRuntime.methods.memoryWrite('key', 'value1');
      CoreUtilityRuntime.methods.memoryWrite('key', 'value2');
      const result = CoreUtilityRuntime.methods.memoryRead('key');

      expect(result).toBe('value2');
    });

    it('should store complex objects', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      const complexObj = { nested: { array: [1, 2, 3] }, flag: true };
      CoreUtilityRuntime.methods.memoryWrite('complex', complexObj);
      const result = CoreUtilityRuntime.methods.memoryRead('complex');

      expect(result).toEqual(complexObj);
    });

    it('should clear all memory', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      CoreUtilityRuntime.methods.memoryWrite('key1', 'value1');
      CoreUtilityRuntime.methods.memoryWrite('key2', 'value2');
      CoreUtilityRuntime.methods.memoryClear();

      expect(CoreUtilityRuntime.methods.memoryRead('key1')).toBeUndefined();
      expect(CoreUtilityRuntime.methods.memoryRead('key2')).toBeUndefined();
    });
  });

  describe('httpRequest', () => {
    it('should make GET request using secureFetch', async () => {
      const { context, logs } = createMockRuntimeContext({
        fetchResponse: async (url) => {
          return createMockFetchResponse({ success: true, url });
        },
      });
      await CoreUtilityRuntime.init?.(context);

      const result = await CoreUtilityRuntime.methods.httpRequest(
        'https://example.com/api',
        'GET',
        { 'Content-Type': 'application/json' }
      );

      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ success: true, url: 'https://example.com/api' });
      expect(logs.some((l) => l.message.includes('HTTP GET'))).toBe(true);
    });

    it('should make POST request with body', async () => {
      let capturedBody: string | undefined;
      const { context } = createMockRuntimeContext({
        fetchResponse: async (_url, options) => {
          capturedBody = options?.body as string;
          return createMockFetchResponse({ received: true });
        },
      });
      await CoreUtilityRuntime.init?.(context);

      await CoreUtilityRuntime.methods.httpRequest(
        'https://example.com/api',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ data: 'test' })
      );

      expect(capturedBody).toBe('{"data":"test"}');
    });

    it('should use Tauri invoke when available and secureFetch not available', async () => {
      let tauriInvoked = false;
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'http_request') {
            tauriInvoked = true;
            return { status: 200, headers: {}, body: '{"tauri":true}', url: 'test' } as T;
          }
          throw new Error('Unknown command');
        },
      });
      // Remove secureFetch to test Tauri fallback
      context.secureFetch = undefined as unknown as RuntimeContext['secureFetch'];
      await CoreUtilityRuntime.init?.(context);

      const result = await CoreUtilityRuntime.methods.httpRequest(
        'https://example.com',
        'GET',
        {}
      );

      expect(tauriInvoked).toBe(true);
      expect(result.body).toBe('{"tauri":true}');
    });

    it('should handle request errors', async () => {
      const { context, logs } = createMockRuntimeContext({
        fetchResponse: async () => {
          throw new Error('Network error');
        },
      });
      await CoreUtilityRuntime.init?.(context);

      await expect(
        CoreUtilityRuntime.methods.httpRequest('https://example.com', 'GET', {})
      ).rejects.toThrow('Network error');
      expect(logs.some((l) => l.message.includes('HTTP request failed'))).toBe(true);
    });
  });

  describe('getServiceUrl', () => {
    it('should return URL from Tauri invoke', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'get_service_port') {
            return 8080 as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreUtilityRuntime.init?.(context);

      const result = await CoreUtilityRuntime.methods.getServiceUrl('my-service');

      expect(result).toBe('http://127.0.0.1:8080');
      expect(logs.some((l) => l.message.includes('running on'))).toBe(true);
    });

    it('should return null when service not running (Tauri)', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(): Promise<T> => {
          return null as T;
        },
      });
      await CoreUtilityRuntime.init?.(context);

      const result = await CoreUtilityRuntime.methods.getServiceUrl('my-service');

      expect(result).toBeNull();
      expect(logs.some((l) => l.message.includes('is not running'))).toBe(true);
    });

    it('should fallback to API endpoint when Tauri not available', async () => {
      const { context } = createMockRuntimeContext({
        fetchResponse: async () => {
          return createMockFetchResponse({ data: { port: 9090 } });
        },
      });
      await CoreUtilityRuntime.init?.(context);

      const result = await CoreUtilityRuntime.methods.getServiceUrl('my-service');

      expect(result).toBe('http://127.0.0.1:9090');
    });

    it('should return null on error', async () => {
      const { context, logs } = createMockRuntimeContext({
        fetchResponse: async () => {
          throw new Error('API error');
        },
      });
      await CoreUtilityRuntime.init?.(context);

      const result = await CoreUtilityRuntime.methods.getServiceUrl('my-service');

      expect(result).toBeNull();
      expect(logs.some((l) => l.message.includes('Failed to get service URL'))).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clear memory on cleanup', async () => {
      const { context } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context);

      CoreUtilityRuntime.methods.memoryWrite('key', 'value');
      await CoreUtilityRuntime.cleanup?.();

      // Re-init and check memory is cleared
      const { context: context2 } = createMockRuntimeContext();
      await CoreUtilityRuntime.init?.(context2);
      expect(CoreUtilityRuntime.methods.memoryRead('key')).toBeUndefined();
    });
  });
});

// Type import for the test
type RuntimeContext = import('../../src/module-types.js').RuntimeContext;

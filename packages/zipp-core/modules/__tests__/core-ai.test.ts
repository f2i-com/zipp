/**
 * Tests for Core AI Module Runtime
 *
 * Tests LLM chat and custom request functionality.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockFetchResponse } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreAIRuntime from '../core-ai/runtime.js';

describe('CoreAIRuntime', () => {
  beforeEach(async () => {
    await CoreAIRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreAIRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('chat', () => {
    it('should make chat request and return response', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        constants: { OPENAI_API_KEY: 'test-key' },
        fetchResponse: async () =>
          createMockFetchResponse({
            choices: [{ message: { content: 'Hello! How can I help?' } }],
          }),
      });
      await CoreAIRuntime.init?.(context);

      const result = await CoreAIRuntime.methods.chat(
        'You are helpful',  // systemPrompt
        'Hello',             // userPrompt
        null,                // input
        'https://api.openai.com/v1/chat/completions',  // endpoint
        'gpt-4',             // model
        'OPENAI_API_KEY',    // apiKeyConstant
        false,               // streaming
        1000,                // maxTokens
        0.7,                 // temperature
        '',                  // responseFormat
        false,               // includeImages
        'auto',              // visionDetail
        'node-1'             // nodeId
      );

      expect(result).toBe('Hello! How can I help?');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Chat completed'))).toBe(true);
    });

    it('should reject empty endpoint', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAIRuntime.init?.(context);

      await expect(
        CoreAIRuntime.methods.chat(
          'System',
          'Hello',
          null,
          '',  // empty endpoint
          'gpt-4',
          '',
          false,
          1000,
          0.7,
          '',
          false,
          'auto',
          'node-1'
        )
      ).rejects.toThrow('Endpoint URL is required');
    });

    it('should reject invalid URL', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAIRuntime.init?.(context);

      await expect(
        CoreAIRuntime.methods.chat(
          'System',
          'Hello',
          null,
          'not-a-valid-url',
          'gpt-4',
          '',
          false,
          1000,
          0.7,
          '',
          false,
          'auto',
          'node-1'
        )
      ).rejects.toThrow('Invalid endpoint URL');
    });

    it('should build request with correct parameters', async () => {
      let capturedBody: Record<string, unknown> = {};
      const { context } = createMockRuntimeContext({
        fetchResponse: async (_url, options) => {
          capturedBody = JSON.parse(options?.body as string);
          return createMockFetchResponse({
            choices: [{ message: { content: 'Response' } }],
          });
        },
      });
      await CoreAIRuntime.init?.(context);

      await CoreAIRuntime.methods.chat(
        'You are a math tutor',
        'What is 2+2?',
        null,
        'https://api.openai.com/v1/chat/completions',
        'gpt-4o',
        '',
        false,
        500,
        0.5,
        '',
        false,
        'auto',
        'node-1'
      );

      expect(capturedBody.model).toBe('gpt-4o');
      expect(capturedBody.max_tokens).toBe(500);
      expect(capturedBody.temperature).toBe(0.5);
      const messages = capturedBody.messages as Array<{ role: string; content: unknown }>;
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are a math tutor');
    });

    it('should include Authorization header with API key', async () => {
      let capturedHeaders: Record<string, string> = {};
      const { context } = createMockRuntimeContext({
        constants: { MY_API_KEY: 'sk-test123' },
        fetchResponse: async (_url, options) => {
          capturedHeaders = Object.fromEntries(
            Object.entries(options?.headers || {}).map(([k, v]) => [k, v as string])
          );
          return createMockFetchResponse({
            choices: [{ message: { content: 'OK' } }],
          });
        },
      });
      await CoreAIRuntime.init?.(context);

      await CoreAIRuntime.methods.chat(
        'System',
        'Hello',
        null,
        'https://api.openai.com/v1/chat/completions',
        'gpt-4',
        'MY_API_KEY',
        false,
        1000,
        0.7,
        '',
        false,
        'auto',
        'node-1'
      );

      expect(capturedHeaders['Authorization']).toBe('Bearer sk-test123');
    });

    it('should handle API errors gracefully', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        fetchResponse: async () =>
          new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
            status: 429,
          }),
      });
      await CoreAIRuntime.init?.(context);

      await expect(
        CoreAIRuntime.methods.chat(
          'System',
          'Hello',
          null,
          'https://api.openai.com/v1/chat/completions',
          'gpt-4',
          '',
          false,
          1000,
          0.7,
          '',
          false,
          'auto',
          'node-1'
        )
      ).rejects.toThrow();
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('request', () => {
    it('should make custom API request', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        fetchResponse: async () =>
          createMockFetchResponse({ result: 'success', data: [1, 2, 3] }),
      });
      await CoreAIRuntime.init?.(context);

      const result = await CoreAIRuntime.methods.request(
        JSON.stringify({ query: 'test' }),  // body
        'https://api.example.com/endpoint',  // endpoint
        'test-api-key',                      // apiKey
        'node-1'                             // nodeId
      );

      expect(result).toContain('success');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Custom request'))).toBe(true);
    });

    it('should reject empty endpoint', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAIRuntime.init?.(context);

      await expect(
        CoreAIRuntime.methods.request('{}', '', '', 'node-1')
      ).rejects.toThrow('Endpoint URL is required');
    });

    it('should handle request errors', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        fetchResponse: async () => new Response('Server Error', { status: 500 }),
      });
      await CoreAIRuntime.init?.(context);

      await expect(
        CoreAIRuntime.methods.request(
          '{}',
          'https://api.example.com/endpoint',
          '',
          'node-1'
        )
      ).rejects.toThrow();
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreAIRuntime.init?.(context);
      await CoreAIRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

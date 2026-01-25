/**
 * Tests for Core Browser Module Runtime
 *
 * Tests HTTP requests, URL validation, data extraction, session management.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockFetchResponse, createMockTauriInvoke } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreBrowserRuntime from '../core-browser/runtime.js';

describe('CoreBrowserRuntime', () => {
  beforeEach(async () => {
    await CoreBrowserRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('URL validation', () => {
    it('should reject empty URL', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreBrowserRuntime.init?.(context);

      await expect(
        CoreBrowserRuntime.methods.request('', 'GET', '{}', '', undefined, 'node-1')
      ).rejects.toThrow('URL is required');
    });

    it('should reject URL exceeding max length', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreBrowserRuntime.init?.(context);

      const longUrl = 'https://example.com/' + 'a'.repeat(9000);
      await expect(
        CoreBrowserRuntime.methods.request(longUrl, 'GET', '{}', '', undefined, 'node-1')
      ).rejects.toThrow('URL exceeds maximum length');
    });

    it('should reject invalid URL', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreBrowserRuntime.init?.(context);

      await expect(
        CoreBrowserRuntime.methods.request('not-a-valid-url', 'GET', '{}', '', undefined, 'node-1')
      ).rejects.toThrow('Invalid URL');
    });

    it('should reject non-http(s) protocols', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreBrowserRuntime.init?.(context);

      await expect(
        CoreBrowserRuntime.methods.request('ftp://example.com', 'GET', '{}', '', undefined, 'node-1')
      ).rejects.toThrow('Invalid protocol');

      await expect(
        CoreBrowserRuntime.methods.request('file:///etc/passwd', 'GET', '{}', '', undefined, 'node-1')
      ).rejects.toThrow('Invalid protocol');
    });

    it('should reject javascript: URLs', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreBrowserRuntime.init?.(context);

      await expect(
        CoreBrowserRuntime.methods.request('https://example.com?r=javascript:alert(1)', 'GET', '{}', '', undefined, 'node-1')
      ).rejects.toThrow('JavaScript URLs are not allowed');
    });

    it('should accept valid http URL', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          http_request: { status: 200, headers: {}, body: 'OK', url: 'http://example.com' },
        }),
      });
      await CoreBrowserRuntime.init?.(context);

      const result = await CoreBrowserRuntime.methods.request(
        'http://example.com',
        'GET',
        '{}',
        '',
        undefined,
        'node-1'
      );

      expect(result.status).toBe(200);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
    });

    it('should accept valid https URL', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          http_request: { status: 200, headers: {}, body: 'OK', url: 'https://example.com' },
        }),
      });
      await CoreBrowserRuntime.init?.(context);

      const result = await CoreBrowserRuntime.methods.request(
        'https://example.com',
        'GET',
        '{}',
        '',
        undefined,
        'node-1'
      );

      expect(result.status).toBe(200);
    });
  });

  describe('request body validation', () => {
    it('should reject request body exceeding max size', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreBrowserRuntime.init?.(context);

      const largeBody = 'x'.repeat(11 * 1024 * 1024);
      await expect(
        CoreBrowserRuntime.methods.request('https://example.com', 'POST', '{}', largeBody, undefined, 'node-1')
      ).rejects.toThrow('exceeds maximum size');
    });
  });

  describe('createSession', () => {
    it('should create HTTP session by default', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        '',
        '',
        'node-1'
      );

      expect(session.id).toBeDefined();
      expect(session.mode).toBe('http');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Session created'))).toBe(true);
    });

    it('should parse custom headers', async () => {
      const { context } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        JSON.stringify({ Authorization: 'Bearer token' }),
        '',
        'node-1'
      );

      expect(session.headers).toEqual({ Authorization: 'Bearer token' });
    });

    it('should parse initial cookies', async () => {
      const { context } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        '',
        JSON.stringify({ session_id: 'abc123' }),
        'node-1'
      );

      expect(session.cookies).toEqual({ session_id: 'abc123' });
    });

    it('should handle invalid headers JSON gracefully', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        'invalid json {',
        '',
        'node-1'
      );

      expect(session.headers).toEqual({});
      expect(logs.some((l) => l.message.includes('Invalid custom headers'))).toBe(true);
    });

    it('should create native webview session when Tauri available', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-browser|webview_create': { success: true, session_id: 'native-session-123' },
        }),
      });
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'webview',
        '',
        '',
        '',
        'node-1'
      );

      expect(session.id).toBe('native-session-123');
      expect(session.mode).toBe('webview');
      expect(logs.some((l) => l.message.includes('Native session created'))).toBe(true);
    });

    it('should fallback to HTTP mode when native fails', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw new Error('WebView not available');
        },
      });
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'webview',
        '',
        '',
        '',
        'node-1'
      );

      expect(session.mode).toBe('http');
      expect(logs.some((l) => l.message.includes('falling back to HTTP mode'))).toBe(true);
    });
  });

  describe('request', () => {
    it('should make GET request via Tauri', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          http_request: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: '{"data":"test"}',
            url: 'https://api.example.com/data',
          },
        }),
      });
      await CoreBrowserRuntime.init?.(context);

      const result = await CoreBrowserRuntime.methods.request(
        'https://api.example.com/data',
        'GET',
        '{}',
        '',
        undefined,
        'node-1'
      );

      expect(result.status).toBe(200);
      expect(result.body).toBe('{"data":"test"}');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Response: 200'))).toBe(true);
    });

    it('should make POST request with body', async () => {
      let capturedArgs: Record<string, unknown> = {};
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(_cmd: string, args?: Record<string, unknown>): Promise<T> => {
          capturedArgs = args || {};
          return { status: 201, headers: {}, body: 'Created', url: 'https://api.example.com' } as T;
        },
      });
      await CoreBrowserRuntime.init?.(context);

      await CoreBrowserRuntime.methods.request(
        'https://api.example.com/data',
        'POST',
        '{}',
        '{"name":"test"}',
        undefined,
        'node-1'
      );

      const request = capturedArgs.request as Record<string, unknown>;
      expect(request.method).toBe('POST');
      expect(request.body).toBe('{"name":"test"}');
    });

    it('should merge session headers and cookies', async () => {
      let capturedArgs: Record<string, unknown> = {};
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(_cmd: string, args?: Record<string, unknown>): Promise<T> => {
          capturedArgs = args || {};
          return { status: 200, headers: {}, body: 'OK', url: 'https://api.example.com' } as T;
        },
      });
      await CoreBrowserRuntime.init?.(context);

      // Create session with headers and cookies
      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        JSON.stringify({ 'X-Custom': 'header' }),
        JSON.stringify({ auth: 'token' }),
        'node-1'
      );

      await CoreBrowserRuntime.methods.request(
        'https://api.example.com',
        'GET',
        '{}',
        '',
        session.id,
        'node-2'
      );

      const request = capturedArgs.request as Record<string, unknown>;
      const headers = request.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('header');
      expect(headers['Cookie']).toBe('auth=token');
    });

    it('should update session cookies from Set-Cookie header', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'http_request') {
            return {
              status: 200,
              headers: { 'set-cookie': 'session=newvalue; Path=/' },
              body: 'OK',
              url: 'https://api.example.com',
            } as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        '',
        '',
        'node-1'
      );

      await CoreBrowserRuntime.methods.request(
        'https://api.example.com',
        'GET',
        '{}',
        '',
        session.id,
        'node-2'
      );

      // Check that cookie was added to session
      expect(session.cookies?.session).toBe('newvalue');
    });

    it('should convert binary response to data URL', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          http_request: {
            status: 200,
            headers: { 'content-type': 'image/png' },
            body: 'iVBORw0KGgo=',
            url: 'https://example.com/image.png',
            bodyIsBase64: true,
          },
        }),
      });
      await CoreBrowserRuntime.init?.(context);

      const result = await CoreBrowserRuntime.methods.request(
        'https://example.com/image.png',
        'GET',
        '{}',
        '',
        undefined,
        'node-1'
      );

      expect(result.body).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(logs.some((l) => l.message.includes('Binary response converted'))).toBe(true);
    });

    it('should fallback to fetch when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        fetchResponse: async () => createMockFetchResponse({ fallback: true }),
      });
      await CoreBrowserRuntime.init?.(context);

      const result = await CoreBrowserRuntime.methods.request(
        'https://api.example.com',
        'GET',
        '{}',
        '',
        undefined,
        'node-1'
      );

      expect(JSON.parse(result.body)).toEqual({ fallback: true });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
    });

    it('should handle request errors', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw new Error('Connection refused');
        },
      });
      await CoreBrowserRuntime.init?.(context);

      await expect(
        CoreBrowserRuntime.methods.request('https://api.example.com', 'GET', '{}', '', undefined, 'node-1')
      ).rejects.toThrow('Connection refused');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.message.includes('Request failed'))).toBe(true);
    });
  });

  describe('extract', () => {
    describe('JSONPath extraction', () => {
      it('should extract simple property', async () => {
        const { context } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          '{"name":"John","age":30}',
          'jsonpath',
          '$.name',
          ''
        );

        expect(result).toBe('John');
      });

      it('should extract nested property', async () => {
        const { context } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          '{"user":{"name":"John"}}',
          'jsonpath',
          '$.user.name',
          ''
        );

        expect(result).toBe('John');
      });

      it('should extract array element', async () => {
        const { context } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          '{"items":["a","b","c"]}',
          'jsonpath',
          '$.items[1]',
          ''
        );

        expect(result).toBe('b');
      });

      it('should map over array', async () => {
        const { context } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          '{"users":[{"name":"John"},{"name":"Jane"}]}',
          'jsonpath',
          '$.users.name',
          ''
        );

        expect(result).toEqual(['John', 'Jane']);
      });

      it('should handle invalid JSON', async () => {
        const { context, logs } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          'not json',
          'jsonpath',
          '$.name',
          ''
        );

        expect(result).toBe('');
        expect(logs.some((l) => l.message.includes('Invalid JSON'))).toBe(true);
      });
    });

    describe('Regex extraction', () => {
      it('should extract with regex', async () => {
        const { context } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          'Email: test@example.com',
          'regex',
          '[\\w.]+@[\\w.]+',
          ''
        );

        expect(result).toBe('test@example.com');
      });

      it('should extract capture groups', async () => {
        const { context } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          'Name: John Doe',
          'regex',
          'Name: (\\w+ \\w+)',
          ''
        );

        expect(result).toBe('John Doe');
      });

      it('should return array for multiple matches', async () => {
        const { context } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          'a@b.com, c@d.com, e@f.com',
          'regex',
          '[\\w]+@[\\w.]+',
          ''
        );

        expect(result).toEqual(['a@b.com', 'c@d.com', 'e@f.com']);
      });

      it('should reject empty pattern', async () => {
        const { context, logs } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          'content',
          'regex',
          '',
          ''
        );

        expect(result).toEqual([]);
        expect(logs.some((l) => l.message.includes('Empty regex pattern'))).toBe(true);
      });

      it('should reject pattern exceeding max length', async () => {
        const { context, logs } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const longPattern = 'a'.repeat(501);
        const result = CoreBrowserRuntime.methods.extract(
          'content',
          'regex',
          longPattern,
          ''
        );

        expect(result).toEqual([]);
        expect(logs.some((l) => l.message.includes('too long'))).toBe(true);
      });

      it('should handle invalid regex', async () => {
        const { context, logs } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          'content',
          'regex',
          '[invalid(regex',
          ''
        );

        expect(result).toEqual([]);
        expect(logs.some((l) => l.message.includes('Invalid regex'))).toBe(true);
      });

      it('should limit iterations to prevent ReDoS', async () => {
        const { context, logs } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        // Pattern that could cause many iterations
        const content = 'a'.repeat(200000);
        const result = CoreBrowserRuntime.methods.extract(
          content,
          'regex',
          'a',
          ''
        );

        // Should stop after MAX_ITERATIONS or MAX_RESULTS
        expect(Array.isArray(result)).toBe(true);
        expect((result as string[]).length).toBeLessThanOrEqual(10000);
        // Should have logged a warning about limit
        expect(logs.some((l) => l.message.includes('limit'))).toBe(true);
      });
    });

    describe('CSS Selector extraction', () => {
      // Note: CSS selector tests require DOMParser which may not be available in Node.js
      // These tests verify the code path but may return empty results in test environment

      it('should handle empty selector', async () => {
        const { context, logs } = createMockRuntimeContext();
        await CoreBrowserRuntime.init?.(context);

        const result = CoreBrowserRuntime.methods.extract(
          '<div>content</div>',
          'selector',
          '',
          'text'
        );

        expect(result).toEqual([]);
        expect(logs.some((l) => l.message.includes('Empty CSS selector'))).toBe(true);
      });
    });

    it('should return empty string for unknown extract type', async () => {
      const { context } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      const result = CoreBrowserRuntime.methods.extract(
        'content',
        'unknown',
        'pattern',
        ''
      );

      expect(result).toBe('');
    });
  });

  describe('control', () => {
    it('should perform goto action in HTTP mode', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        fetchResponse: async () => createMockFetchResponse('<html><body>Page content</body></html>'),
      });
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        '',
        '',
        'node-1'
      );

      const result = await CoreBrowserRuntime.methods.control(
        session,
        'goto',
        'https://example.com',
        undefined,
        30000,
        'node-2'
      );

      expect(result).toContain('Page content');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-2', status: 'completed' });
    });

    it('should reject non-goto actions in HTTP mode', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        '',
        '',
        'node-1'
      );

      await expect(
        CoreBrowserRuntime.methods.control(session, 'click', '#button', undefined, 30000, 'node-2')
      ).rejects.toThrow('HTTP mode only supports');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-2', status: 'error' });
    });
  });

  describe('closeSession', () => {
    it('should close HTTP session', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'http',
        '',
        '',
        '',
        'node-1'
      );

      await CoreBrowserRuntime.methods.closeSession(session.id);

      expect(logs.some((l) => l.message.includes('Session closed'))).toBe(true);
    });

    it('should handle closing non-existent session', async () => {
      const { context } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      // Should not throw
      await CoreBrowserRuntime.methods.closeSession('non-existent');
    });

    it('should close native webview session', async () => {
      let closeCalled = false;
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-browser|webview_create') {
            return { success: true, session_id: 'native-123' } as T;
          }
          if (cmd === 'plugin:zipp-browser|webview_close') {
            closeCalled = true;
            return undefined as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreBrowserRuntime.init?.(context);

      const session = await CoreBrowserRuntime.methods.createSession(
        'default',
        'webview',
        '',
        '',
        '',
        'node-1'
      );

      await CoreBrowserRuntime.methods.closeSession(session.id);

      expect(closeCalled).toBe(true);
      expect(logs.some((l) => l.message.includes('Session closed'))).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should close all sessions on cleanup', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreBrowserRuntime.init?.(context);

      // Create multiple sessions
      await CoreBrowserRuntime.methods.createSession('default', 'http', '', '', '', 'n1');
      await CoreBrowserRuntime.methods.createSession('default', 'http', '', '', '', 'n2');

      await CoreBrowserRuntime.cleanup?.();

      expect(logs.filter((l) => l.message.includes('Session closed')).length).toBe(2);
      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

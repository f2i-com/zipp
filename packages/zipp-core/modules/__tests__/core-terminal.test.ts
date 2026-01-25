/**
 * Tests for Core Terminal Module Runtime
 *
 * Tests terminal session creation and command execution.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockTauriInvoke } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreTerminalRuntime from '../core-terminal/runtime.js';

describe('CoreTerminalRuntime', () => {
  beforeEach(async () => {
    await CoreTerminalRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreTerminalRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('createSession', () => {
    it('should create terminal session with Tauri', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-terminal|terminal_create': {
            success: true,
            session_id: 'session-123',
          },
        }),
      });
      await CoreTerminalRuntime.init?.(context);

      const result = await CoreTerminalRuntime.methods.createSession(
        'powershell',  // shell
        '',            // workingDir
        false,         // showWindow
        'Test',        // title
        'node-1'       // nodeId
      );

      expect(result.id).toBe('session-123');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Session created'))).toBe(true);
    });

    it('should throw error when Tauri not available', async () => {
      const { context } = createMockRuntimeContext();
      await CoreTerminalRuntime.init?.(context);

      await expect(
        CoreTerminalRuntime.methods.createSession('bash', '', false, 'Test', 'node-1')
      ).rejects.toThrow('Tauri not available');
    });

    it('should handle session creation failure', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-terminal|terminal_create': {
            success: false,
            error: 'Shell not found',
          },
        }),
      });
      await CoreTerminalRuntime.init?.(context);

      await expect(
        CoreTerminalRuntime.methods.createSession('invalid-shell', '', false, 'Test', 'node-1')
      ).rejects.toThrow('Shell not found');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('closeSession', () => {
    it('should close terminal session', async () => {
      let closeCalled = false;
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-terminal|terminal_create') {
            return { success: true, session_id: 'session-123' } as T;
          }
          if (cmd === 'plugin:zipp-terminal|terminal_close') {
            closeCalled = true;
            return undefined as T;
          }
          throw new Error('Unknown command: ' + cmd);
        },
      });
      await CoreTerminalRuntime.init?.(context);

      // Create a session first
      await CoreTerminalRuntime.methods.createSession('bash', '', false, 'Test', 'node-1');

      await CoreTerminalRuntime.methods.closeSession('session-123');

      expect(closeCalled).toBe(true);
      expect(logs.some((l) => l.message.includes('Session closed'))).toBe(true);
    });

    it('should not throw on close non-existent session', async () => {
      const { context } = createMockRuntimeContext();
      await CoreTerminalRuntime.init?.(context);

      // Should not throw
      await CoreTerminalRuntime.methods.closeSession('non-existent');
    });
  });

  describe('cleanup', () => {
    it('should close all sessions on cleanup', async () => {
      let createCount = 0;
      let closeCount = 0;
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-terminal|terminal_create') {
            createCount++;
            return { success: true, session_id: `session-${createCount}` } as T;
          }
          if (cmd === 'plugin:zipp-terminal|terminal_close') {
            closeCount++;
            return undefined as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreTerminalRuntime.init?.(context);

      // Create some sessions
      await CoreTerminalRuntime.methods.createSession('bash', '', false, 'Test', 'node-1');
      await CoreTerminalRuntime.methods.createSession('bash', '', false, 'Test', 'node-2');

      await CoreTerminalRuntime.cleanup?.();

      expect(closeCount).toBe(2);
      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

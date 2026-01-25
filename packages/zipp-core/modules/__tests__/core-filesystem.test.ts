/**
 * Tests for Core Filesystem Module Runtime
 *
 * Tests file operations: read, write, list, copy with path validation.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockTauriInvoke } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreFilesystemRuntime from '../core-filesystem/runtime.js';

describe('CoreFilesystemRuntime', () => {
  beforeEach(async () => {
    await CoreFilesystemRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('path validation', () => {
    it('should reject paths with traversal sequences', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      const traversalPaths = [
        'C:/users/../etc/passwd',
        'C:/users/..\\windows',
        '/home/user/../etc',
        '../secret.txt',
        '..\\secret.txt',
      ];

      for (const path of traversalPaths) {
        await expect(
          CoreFilesystemRuntime.methods.readFile(path, 'text', 'node-1')
        ).rejects.toThrow(/Path traversal detected/);
      }
    });

    it('should reject paths with null bytes', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.readFile('C:/file.txt\0.exe', 'text', 'node-1')
      ).rejects.toThrow(/null bytes/);
    });

    it('should reject URL-encoded traversal', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.readFile('C:/users/%2e%2e/secret', 'text', 'node-1')
      ).rejects.toThrow(/Encoded path traversal detected/);
    });

    it('should reject Windows device paths', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      const devicePaths = [
        '\\\\.\\PhysicalDrive0',
        '\\\\?\\C:\\file.txt',
      ];

      for (const path of devicePaths) {
        await expect(
          CoreFilesystemRuntime.methods.readFile(path, 'text', 'node-1')
        ).rejects.toThrow(/Dangerous path prefix detected/);
      }
    });

    it('should reject Windows reserved device names', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      const deviceNames = ['C:\\folder\\CON', 'C:\\PRN', 'C:\\AUX.txt', 'C:\\NUL', 'C:\\COM1', 'C:\\LPT1'];

      for (const path of deviceNames) {
        await expect(
          CoreFilesystemRuntime.methods.readFile(path, 'text', 'node-1')
        ).rejects.toThrow(/Reserved device name/);
      }
    });

    it('should reject empty paths', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.readFile('', 'text', 'node-1')
      ).rejects.toThrow(/Path is required/);
    });
  });

  describe('listFolder', () => {
    it('should list files in folder', async () => {
      const mockFiles = [
        { path: '/home/user/file1.txt', name: 'file1.txt', nameWithoutExt: 'file1', ext: 'txt', size: 100, modifiedAt: '2024-01-01', isDirectory: false },
        { path: '/home/user/file2.txt', name: 'file2.txt', nameWithoutExt: 'file2', ext: 'txt', size: 200, modifiedAt: '2024-01-02', isDirectory: false },
      ];
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|list_folder': mockFiles,
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.listFolder(
        '/home/user',
        false,
        '',
        100,
        'node-1'
      );

      expect(result).toEqual(mockFiles);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Found 2 files'))).toBe(true);
    });

    it('should pass include patterns correctly', async () => {
      let capturedArgs: Record<string, unknown> = {};
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(_cmd: string, args?: Record<string, unknown>): Promise<T> => {
          capturedArgs = args || {};
          return [] as T;
        },
      });
      await CoreFilesystemRuntime.init?.(context);

      await CoreFilesystemRuntime.methods.listFolder(
        '/home/user',
        true,
        '*.txt, *.md, *.json',
        50,
        'node-1'
      );

      expect(capturedArgs.includePatterns).toEqual(['*.txt', '*.md', '*.json']);
      expect(capturedArgs.recursive).toBe(true);
      expect(capturedArgs.maxFiles).toBe(50);
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.listFolder('/home', false, '', 100, 'node-1')
      ).rejects.toThrow('Tauri not available');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should handle listing errors', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw 'Directory not found';
        },
      });
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.listFolder('/nonexistent', false, '', 100, 'node-1')
      ).rejects.toThrow('Directory not found');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.message.includes('listFolder failed'))).toBe(true);
    });
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': {
            content: 'Hello, World!',
            size: 13,
            path: 'C:/file.txt',
            name: 'file.txt',
            nameWithoutExt: 'file',
            ext: 'txt',
            isLargeFile: false,
          },
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.readFile(
        'C:/file.txt',
        'text',
        'node-1'
      );

      expect(result).toBe('Hello, World!');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Read 13 chars'))).toBe(true);
    });

    it('should return file reference for large files', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': {
            content: '',
            size: 100000000,
            path: 'C:/large-file.bin',
            name: 'large-file.bin',
            nameWithoutExt: 'large-file',
            ext: 'bin',
            isLargeFile: true,
          },
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.readFile(
        'C:/large-file.bin',
        'text',
        'node-1'
      );

      const parsed = JSON.parse(result);
      expect(parsed.__type).toBe('file_ref');
      expect(parsed.path).toBe('C:/large-file.bin');
      expect(parsed.size).toBe(100000000);
      expect(logs.some((l) => l.message.includes('File too large'))).toBe(true);
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.readFile('C:/file.txt', 'text', 'node-1')
      ).rejects.toThrow('Tauri not available');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should handle Tauri string errors', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw 'File not found';
        },
      });
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.readFile('C:/nonexistent.txt', 'text', 'node-1')
      ).rejects.toThrow('File not found');
      expect(logs.some((l) => l.message.includes('readFile failed'))).toBe(true);
    });
  });

  describe('writeFile', () => {
    it('should write file content', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|write_file': 'C:/output.txt',
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.writeFile(
        'C:/output.txt',
        'Hello, World!',
        'text',
        true,
        'node-1'
      );

      expect(result).toBe('C:/output.txt');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Wrote to'))).toBe(true);
    });

    it('should reject corrupted paths', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      const corruptedPaths = [
        '[object Object]',
        'path/[object Object]/file.txt',
        'undefined/file.txt',
        'null',
        'NaN/file.txt',
        '__downloads_path__/file.txt',
        '[FileWrite]/test.txt',
        '[Module Error]/test.txt',
        'true',
        'false',
      ];

      for (const path of corruptedPaths) {
        const result = await CoreFilesystemRuntime.methods.writeFile(
          path,
          'content',
          'text',
          false,
          'node-1'
        );
        expect(result.startsWith('ERROR_')).toBe(true);
      }
    });

    it('should reject non-absolute paths', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.writeFile(
        'relative/path/file.txt',
        'content',
        'text',
        false,
        'node-1'
      );

      expect(result).toBe('ERROR_NOT_ABSOLUTE_PATH');
      expect(logs.some((l) => l.message.includes('not absolute'))).toBe(true);
    });

    it('should accept Unix absolute paths', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|write_file': '/home/user/file.txt',
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.writeFile(
        '/home/user/file.txt',
        'content',
        'text',
        false,
        'node-1'
      );

      expect(result).toBe('/home/user/file.txt');
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.writeFile('C:/file.txt', 'content', 'text', false, 'node-1')
      ).rejects.toThrow('Tauri not available');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('copyFile', () => {
    it('should copy file to destination', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|native_copy_file': 0,
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.copyFile(
        'C:/source.txt',
        'C:/dest.txt',
        true,
        'node-1'
      );

      expect(result).toBe('C:/dest.txt');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Copied to'))).toBe(true);
    });

    it('should validate both source and destination paths', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.copyFile('C:/source.txt', '../dest.txt', false, 'node-1')
      ).rejects.toThrow(/Path traversal detected/);

      await expect(
        CoreFilesystemRuntime.methods.copyFile('../source.txt', 'C:/dest.txt', false, 'node-1')
      ).rejects.toThrow(/Path traversal detected/);
    });

    it('should work without nodeId', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|native_copy_file': 0,
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.copyFile(
        'C:/source.txt',
        'C:/dest.txt'
      );

      expect(result).toBe('C:/dest.txt');
      expect(nodeStatuses.length).toBe(0);
    });
  });

  describe('calculateFileChunks', () => {
    it('should calculate chunk boundaries', async () => {
      const mockChunks = [
        { path: 'C:/file.txt', start: 0, length: 1000, index: 0, total: 3 },
        { path: 'C:/file.txt', start: 800, length: 1000, index: 1, total: 3 },
        { path: 'C:/file.txt', start: 1600, length: 1000, index: 2, total: 3 },
      ];
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|calculate_file_chunks': mockChunks,
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.calculateFileChunks(
        'C:/file.txt',
        1000,
        200,
        'node-1'
      );

      expect(result).toEqual(mockChunks);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Calculated 3 chunks'))).toBe(true);
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.calculateFileChunks('C:/file.txt', 1000, 0, 'node-1')
      ).rejects.toThrow('Tauri not available');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('readChunkContent', () => {
    it('should read chunk content', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_chunk_content': 'chunk content here',
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.readChunkContent(
        'C:/file.txt',
        0,
        1000,
        'text'
      );

      expect(result).toBe('chunk content here');
    });

    it('should throw error when Tauri not available', async () => {
      const { context } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);

      await expect(
        CoreFilesystemRuntime.methods.readChunkContent('C:/file.txt', 0, 1000)
      ).rejects.toThrow('Tauri not available');
    });
  });

  describe('getDownloadsPath', () => {
    it('should return downloads path from Tauri', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          get_downloads_path: 'C:/Users/test/Downloads',
        }),
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.getDownloadsPath();

      expect(result).toBe('C:/Users/test/Downloads');
    });

    it('should return null when Tauri not available', async () => {
      const { context } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.getDownloadsPath();

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw new Error('Failed');
        },
      });
      await CoreFilesystemRuntime.init?.(context);

      const result = await CoreFilesystemRuntime.methods.getDownloadsPath();

      expect(result).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreFilesystemRuntime.init?.(context);
      await CoreFilesystemRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

/**
 * Tests for Core Input Module Runtime
 *
 * Tests file input reading, file picker, and folder picker operations.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockTauriInvoke } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreInputRuntime from '../core-input/runtime.js';

describe('CoreInputRuntime', () => {
  beforeEach(async () => {
    await CoreInputRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreInputRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('readInputFile', () => {
    it('should read text file', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: 'Hello, World!' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.readInputFile(
        '/path/to/file.txt',
        'node-1'
      );

      expect(result.fileName).toBe('file.txt');
      expect(result.fileType).toBe('text');
      expect(result.fileContent).toBe('Hello, World!');
      expect(result.filePath).toBe('/path/to/file.txt');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'running' });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Reading:'))).toBe(true);
    });

    it('should read JSON file as text', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: '{"key":"value"}' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.readInputFile(
        '/path/to/data.json',
        'node-1'
      );

      expect(result.fileName).toBe('data.json');
      expect(result.fileType).toBe('text');
      expect(result.fileContent).toBe('{"key":"value"}');
    });

    it('should detect image file type', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: 'base64imagedata' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
      for (const ext of imageExtensions) {
        const result = await CoreInputRuntime.methods.readInputFile(
          `/path/to/image.${ext}`,
          'node-1'
        );
        expect(result.fileType).toBe('image');
      }
    });

    it('should detect video file type', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: 'base64videodata' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const videoExtensions = ['mp4', 'webm', 'avi', 'mov', 'mkv'];
      for (const ext of videoExtensions) {
        const result = await CoreInputRuntime.methods.readInputFile(
          `/path/to/video.${ext}`,
          'node-1'
        );
        expect(result.fileType).toBe('video');
      }
    });

    it('should detect audio file type', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: 'base64audiodata' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const audioExtensions = ['mp3', 'wav', 'ogg', 'flac'];
      for (const ext of audioExtensions) {
        const result = await CoreInputRuntime.methods.readInputFile(
          `/path/to/audio.${ext}`,
          'node-1'
        );
        expect(result.fileType).toBe('audio');
      }
    });

    it('should detect PDF file type', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: 'base64pdfdata' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.readInputFile(
        '/path/to/document.pdf',
        'node-1'
      );

      expect(result.fileType).toBe('pdf');
    });

    it('should handle Windows path separators', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: 'content' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.readInputFile(
        'C:\\Users\\test\\file.txt',
        'node-1'
      );

      expect(result.fileName).toBe('file.txt');
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreInputRuntime.init?.(context);

      await expect(
        CoreInputRuntime.methods.readInputFile('/path/to/file.txt', 'node-1')
      ).rejects.toThrow('Tauri not available');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should handle file read errors', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw new Error('File not found');
        },
      });
      await CoreInputRuntime.init?.(context);

      await expect(
        CoreInputRuntime.methods.readInputFile('/path/to/nonexistent.txt', 'node-1')
      ).rejects.toThrow('File not found');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.message.includes('Failed:'))).toBe(true);
    });

    it('should handle files without extension', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|read_file': { content: 'content' },
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.readInputFile(
        '/path/to/Makefile',
        'node-1'
      );

      expect(result.fileName).toBe('Makefile');
      expect(result.fileType).toBe('text');
    });
  });

  describe('pickFile', () => {
    it('should open file picker and return selected path', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|pick_file': '/selected/file.txt',
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.pickFile(undefined, 'node-1');

      expect(result).toBe('/selected/file.txt');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'running' });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Opening file picker'))).toBe(true);
    });

    it('should pass file filters to picker', async () => {
      let capturedArgs: unknown;
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(_cmd: string, args?: Record<string, unknown>): Promise<T> => {
          capturedArgs = args;
          return '/selected/image.png' as T;
        },
      });
      await CoreInputRuntime.init?.(context);

      const filters = [{ name: 'Images', extensions: ['png', 'jpg'] }];
      await CoreInputRuntime.methods.pickFile(filters, 'node-1');

      expect(capturedArgs).toEqual({ filters });
    });

    it('should return null when user cancels', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|pick_file': null,
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.pickFile();

      expect(result).toBeNull();
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreInputRuntime.init?.(context);

      await expect(CoreInputRuntime.methods.pickFile(undefined, 'node-1')).rejects.toThrow(
        'Tauri not available'
      );
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should work without nodeId', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|pick_file': '/path/file.txt',
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.pickFile();

      expect(result).toBe('/path/file.txt');
    });
  });

  describe('pickFolder', () => {
    it('should open folder picker and return selected path', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|pick_folder': '/selected/folder',
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.pickFolder('node-1');

      expect(result).toBe('/selected/folder');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'running' });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Opening folder picker'))).toBe(true);
    });

    it('should return null when user cancels', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|pick_folder': null,
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.pickFolder();

      expect(result).toBeNull();
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreInputRuntime.init?.(context);

      await expect(CoreInputRuntime.methods.pickFolder('node-1')).rejects.toThrow(
        'Tauri not available'
      );
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should work without nodeId', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|pick_folder': '/path/folder',
        }),
      });
      await CoreInputRuntime.init?.(context);

      const result = await CoreInputRuntime.methods.pickFolder();

      expect(result).toBe('/path/folder');
    });

    it('should handle picker errors', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw new Error('Picker cancelled');
        },
      });
      await CoreInputRuntime.init?.(context);

      await expect(CoreInputRuntime.methods.pickFolder('node-1')).rejects.toThrow(
        'Picker cancelled'
      );
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreInputRuntime.init?.(context);
      await CoreInputRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

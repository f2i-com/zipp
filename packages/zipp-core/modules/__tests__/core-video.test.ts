/**
 * Tests for Core Video Module Runtime
 *
 * Tests video info retrieval and frame extraction.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockTauriInvoke } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreVideoRuntime from '../core-video/runtime.js';

describe('CoreVideoRuntime', () => {
  beforeEach(async () => {
    await CoreVideoRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreVideoRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('getInfo', () => {
    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreVideoRuntime.init?.(context);

      await expect(
        CoreVideoRuntime.methods.getInfo('C:/video.mp4', 'node-1')
      ).rejects.toThrow('requires Tauri');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should return video info from Tauri', async () => {
      const mockInfo = {
        duration: 60.5,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'h264',
        format: 'mp4',
      };
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          get_video_info: mockInfo,
        }),
      });
      await CoreVideoRuntime.init?.(context);

      const result = await CoreVideoRuntime.methods.getInfo('C:/video.mp4', 'node-1');

      expect(result.duration).toBe(60.5);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.fps).toBe(30);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
    });

    it('should handle Tauri errors', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async () => {
          throw new Error('Video file not found');
        },
      });
      await CoreVideoRuntime.init?.(context);

      await expect(
        CoreVideoRuntime.methods.getInfo('C:/nonexistent.mp4', 'node-1')
      ).rejects.toThrow('Video file not found');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('extract', () => {
    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreVideoRuntime.init?.(context);

      await expect(
        CoreVideoRuntime.methods.extract(
          'C:/video.mp4',  // path
          1,               // intervalSeconds
          'jpg',           // outputFormat
          10,              // maxFrames
          'node-1'         // nodeId
        )
      ).rejects.toThrow('requires Tauri');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should extract frames from video', async () => {
      const mockFrames = [
        { timestamp: 0, dataUrl: 'data:image/jpeg;base64,frame1', index: 0, path: '' },
        { timestamp: 1, dataUrl: 'data:image/jpeg;base64,frame2', index: 1, path: '' },
      ];
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          extract_video_frames: mockFrames,
        }),
      });
      await CoreVideoRuntime.init?.(context);

      const result = await CoreVideoRuntime.methods.extract(
        'C:/video.mp4',  // path
        1,               // intervalSeconds
        'jpg',           // outputFormat
        10,              // maxFrames
        'node-1'         // nodeId
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreVideoRuntime.init?.(context);
      await CoreVideoRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

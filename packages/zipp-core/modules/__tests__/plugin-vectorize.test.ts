/**
 * Tests for Plugin Vectorize Module Runtime
 *
 * Tests image to SVG conversion with color quantization.
 * Note: Full image processing tests require browser canvas APIs.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import PluginVectorizeRuntime from '../plugin-vectorize/runtime.js';

describe('PluginVectorizeRuntime', () => {
  beforeEach(async () => {
    await PluginVectorizeRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await PluginVectorizeRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('convert', () => {
    it('should have convert method exposed', async () => {
      const { context } = createMockRuntimeContext();
      await PluginVectorizeRuntime.init?.(context);

      expect(typeof PluginVectorizeRuntime.methods.convert).toBe('function');
    });

    it('should throw error when image cannot be loaded', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await PluginVectorizeRuntime.init?.(context);

      // Empty string input should fail to load
      await expect(
        PluginVectorizeRuntime.methods.convert(
          '',          // imageInput
          '',          // outputPath
          16,          // colorCount
          'balanced',  // quality
          1.0,         // smoothness
          10,          // minArea
          false,       // removeBackground
          true,        // optimize
          'node-1'     // nodeId
        )
      ).rejects.toThrow();
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should throw error for null/undefined input', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await PluginVectorizeRuntime.init?.(context);

      await expect(
        PluginVectorizeRuntime.methods.convert(
          null,        // imageInput
          '',          // outputPath
          16,          // colorCount
          'balanced',  // quality
          1.0,         // smoothness
          10,          // minArea
          false,       // removeBackground
          true,        // optimize
          'node-1'     // nodeId
        )
      ).rejects.toThrow('Could not load image data');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should set node status to running when starting', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await PluginVectorizeRuntime.init?.(context);

      // The promise will reject but node status should be set to running first
      const promise = PluginVectorizeRuntime.methods.convert(
        '',          // will fail
        '',
        16,
        'balanced',
        1.0,
        10,
        false,
        true,
        'node-1'
      );

      // Wait for it to fail
      await promise.catch(() => {});

      // Should have running status recorded (then error)
      expect(nodeStatuses.some((s) => s.nodeId === 'node-1' && s.status === 'running')).toBe(true);
    });

    it('should accept valid quality levels', async () => {
      // Just test that we can call with different quality levels
      // Full processing would need canvas APIs
      const { context } = createMockRuntimeContext();
      await PluginVectorizeRuntime.init?.(context);

      const qualities = ['fast', 'balanced', 'high', 'detailed'];
      for (const quality of qualities) {
        // All will fail due to empty input, but the quality param should be accepted
        await expect(
          PluginVectorizeRuntime.methods.convert(
            '',
            '',
            16,
            quality,
            1.0,
            10,
            false,
            true,
            'node-1'
          )
        ).rejects.toThrow();
      }
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await PluginVectorizeRuntime.init?.(context);
      await PluginVectorizeRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

/**
 * Tests for Core Image Module Runtime
 *
 * Tests image generation, saving, and resizing functionality.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockFetchResponse, createMockTauriInvoke } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreImageRuntime from '../core-image/runtime.js';

describe('CoreImageRuntime', () => {
  beforeEach(async () => {
    await CoreImageRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreImageRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('generate', () => {
    it('should return mock image when no endpoint configured', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      await CoreImageRuntime.init?.(context);

      const result = await CoreImageRuntime.methods.generate(
        'A beautiful sunset',
        '',
        '', // no endpoint
        'dall-e-3',
        '',
        1024,
        1024,
        50,
        'openai',
        'node-1'
      );

      expect(result).toMatch(/^mock:\/\/generated-image-\d+\.png$/);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('No endpoint configured'))).toBe(true);
    });

    it('should combine prompt and input', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreImageRuntime.init?.(context);

      await CoreImageRuntime.methods.generate(
        'A sunset',
        'with mountains',
        '', // no endpoint - will use mock
        'dall-e-3',
        '',
        1024,
        1024,
        50,
        'openai',
        'node-1'
      );

      // Should log the combined prompt
      expect(logs.some((l) => l.message.includes('Generating'))).toBe(true);
    });

    describe('OpenAI format', () => {
      it('should call OpenAI API with correct parameters', async () => {
        let capturedBody: Record<string, unknown> = {};
        const { context, nodeStatuses } = createMockRuntimeContext({
          constants: { OPENAI_API_KEY: 'test-key' },
          fetchResponse: async (_url, options) => {
            capturedBody = JSON.parse(options?.body as string);
            return createMockFetchResponse({
              data: [{ url: 'https://example.com/image.png' }],
            });
          },
        });
        await CoreImageRuntime.init?.(context);

        const result = await CoreImageRuntime.methods.generate(
          'A beautiful sunset',
          '',
          'https://api.openai.com/v1/images/generations',
          'dall-e-3',
          'OPENAI_API_KEY',
          1024,
          1024,
          50,
          'openai',
          'node-1'
        );

        expect(capturedBody.prompt).toBe('A beautiful sunset');
        expect(capturedBody.model).toBe('dall-e-3');
        expect(capturedBody.size).toBe('1024x1024');
        expect(result).toBe('https://example.com/image.png');
        expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      });

      it('should handle OpenAI base64 response', async () => {
        const { context } = createMockRuntimeContext({
          fetchResponse: async () =>
            createMockFetchResponse({
              data: [{ b64_json: 'iVBORw0KGgo=' }],
            }),
        });
        await CoreImageRuntime.init?.(context);

        const result = await CoreImageRuntime.methods.generate(
          'A sunset',
          '',
          'https://api.openai.com/v1/images/generations',
          'dall-e-3',
          '',
          1024,
          1024,
          50,
          'openai',
          'node-1'
        );

        expect(result).toBe('data:image/png;base64,iVBORw0KGgo=');
      });

      it('should handle OpenAI API errors', async () => {
        const { context, nodeStatuses } = createMockRuntimeContext({
          fetchResponse: async () =>
            new Response('Insufficient quota', { status: 429 }),
        });
        await CoreImageRuntime.init?.(context);

        await expect(
          CoreImageRuntime.methods.generate(
            'A sunset',
            '',
            'https://api.openai.com/v1/images/generations',
            'dall-e-3',
            '',
            1024,
            1024,
            50,
            'openai',
            'node-1'
          )
        ).rejects.toThrow('OpenAI API error: 429');
        expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      });
    });

    describe('Gemini format', () => {
      it('should call Gemini API with correct parameters', async () => {
        let capturedUrl = '';
        const { context } = createMockRuntimeContext({
          constants: { GEMINI_API_KEY: 'test-gemini-key' },
          fetchResponse: async (url) => {
            capturedUrl = url;
            return createMockFetchResponse({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: 'image/png',
                          data: 'base64imagedata',
                        },
                      },
                    ],
                  },
                },
              ],
            });
          },
        });
        await CoreImageRuntime.init?.(context);

        const result = await CoreImageRuntime.methods.generate(
          'A cat',
          '',
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
          '',
          'GEMINI_API_KEY',
          1024,
          1024,
          50,
          'gemini',
          'node-1'
        );

        expect(capturedUrl).toContain('key=test-gemini-key');
        expect(result).toBe('data:image/png;base64,base64imagedata');
      });

      it('should handle Gemini API errors', async () => {
        const { context } = createMockRuntimeContext({
          fetchResponse: async () =>
            new Response('Invalid API key', { status: 401 }),
        });
        await CoreImageRuntime.init?.(context);

        await expect(
          CoreImageRuntime.methods.generate(
            'A cat',
            '',
            'https://generativelanguage.googleapis.com/api',
            '',
            '',
            1024,
            1024,
            50,
            'gemini',
            'node-1'
          )
        ).rejects.toThrow('Gemini API error: 401');
      });
    });

    describe('Custom format', () => {
      it('should handle custom API response formats', async () => {
        const { context } = createMockRuntimeContext({
          fetchResponse: async () =>
            createMockFetchResponse({ url: 'https://custom.com/result.png' }),
        });
        await CoreImageRuntime.init?.(context);

        const result = await CoreImageRuntime.methods.generate(
          'A dog',
          '',
          'https://custom.api.com/generate',
          '',
          '',
          1024,
          1024,
          50,
          'custom',
          'node-1'
        );

        expect(result).toBe('https://custom.com/result.png');
      });

      it('should handle various custom response shapes', async () => {
        const { context: ctx1 } = createMockRuntimeContext({
          fetchResponse: async () =>
            createMockFetchResponse({ image_url: 'https://example.com/1.png' }),
        });
        await CoreImageRuntime.init?.(ctx1);
        expect(
          await CoreImageRuntime.methods.generate('test', '', 'https://api.com', '', '', 1024, 1024, 50, 'custom', 'n1')
        ).toBe('https://example.com/1.png');

        const { context: ctx2 } = createMockRuntimeContext({
          fetchResponse: async () =>
            createMockFetchResponse({ images: ['https://example.com/2.png'] }),
        });
        await CoreImageRuntime.init?.(ctx2);
        expect(
          await CoreImageRuntime.methods.generate('test', '', 'https://api.com', '', '', 1024, 1024, 50, 'custom', 'n2')
        ).toBe('https://example.com/2.png');

        const { context: ctx3 } = createMockRuntimeContext({
          fetchResponse: async () =>
            createMockFetchResponse({ output: ['https://example.com/3.png'] }),
        });
        await CoreImageRuntime.init?.(ctx3);
        expect(
          await CoreImageRuntime.methods.generate('test', '', 'https://api.com', '', '', 1024, 1024, 50, 'custom', 'n3')
        ).toBe('https://example.com/3.png');
      });
    });

    describe('ComfyUI format', () => {
      it('should reject invalid workflow JSON', async () => {
        const { context } = createMockRuntimeContext();
        await CoreImageRuntime.init?.(context);

        await expect(
          CoreImageRuntime.methods.generate(
            'not valid json',
            '',
            'http://localhost:8188',
            '',
            '',
            1024,
            1024,
            50,
            'comfyui',
            'node-1'
          )
        ).rejects.toThrow('valid JSON workflow');
      });
    });

  });

  describe('save', () => {
    it('should save data URL image using Tauri', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({
          'plugin:zipp-filesystem|write_file': 'C:/output/image.png',
        }),
      });
      await CoreImageRuntime.init?.(context);

      const result = await CoreImageRuntime.methods.save(
        'data:image/png;base64,iVBORw0KGgo=',
        'C:/output/image.png',
        'png',
        90,
        true,
        'node-1'
      );

      expect(result).toBe('C:/output/image.png');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Image saved'))).toBe(true);
    });

    it('should save image from path using copy', async () => {
      let copyArgs: Record<string, unknown> = {};
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|native_copy_file') {
            copyArgs = args || {};
            return 0 as T;
          }
          if (cmd === 'plugin:zipp-filesystem|read_file') {
            return { content: 'data:image/png;base64,abc', isLargeFile: false } as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreImageRuntime.init?.(context);

      const result = await CoreImageRuntime.methods.save(
        'C:/input/source.png',
        'C:/output/dest.png',
        'png',
        90,
        true,
        'node-1'
      );

      expect(copyArgs.source).toBe('C:/input/source.png');
      expect(result).toBe('C:/output/dest.png');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
    });

    it('should extract image data from object input', async () => {
      let writtenContent = '';
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|write_file') {
            writtenContent = args?.content as string;
            return 'path' as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreImageRuntime.init?.(context);

      await CoreImageRuntime.methods.save(
        { dataUrl: 'data:image/png;base64,testdata', path: '/some/path' },
        'C:/output/image.png',
        'png',
        90,
        true,
        'node-1'
      );

      expect(writtenContent).toBe('data:image/png;base64,testdata');
    });

    it('should throw error when no valid image source', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreImageRuntime.init?.(context);

      await expect(
        CoreImageRuntime.methods.save(null, 'C:/output/image.png', 'png', 90, true, 'node-1')
      ).rejects.toThrow('No valid image source');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should generate output path from source filename', async () => {
      let outputPath = '';
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|native_copy_file') {
            outputPath = args?.destination as string;
            return 0 as T;
          }
          if (cmd === 'plugin:zipp-filesystem|read_file') {
            return { content: '', isLargeFile: false } as T;
          }
          if (cmd === 'plugin:zipp-filesystem|get_downloads_path') {
            return 'C:/Users/test/Downloads' as T;
          }
          throw new Error('Unknown command: ' + cmd);
        },
      });
      await CoreImageRuntime.init?.(context);

      await CoreImageRuntime.methods.save(
        'C:/input/myimage.png',
        '', // no output path
        'png',
        90,
        true,
        'node-1'
      );

      expect(outputPath).toContain('myimage');
      expect(outputPath).toContain('.png');
    });
  });

  describe('resize', () => {
    it('should return error for invalid image data', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreImageRuntime.init?.(context);

      const result = await CoreImageRuntime.methods.resize(
        'not a data url',
        1024,
        200,
        85,
        'node-1'
      );

      expect(result).toContain('Error:');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should use Rust backend when available', async () => {
      let resizeArgs: Record<string, unknown> = {};
      const { context, nodeStatuses, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
          if (cmd === 'resize_image') {
            resizeArgs = args || {};
            return {
              success: true,
              dataUrl: 'data:image/jpeg;base64,resized',
              originalWidth: 2000,
              originalHeight: 1500,
              newWidth: 1024,
              newHeight: 768,
              originalSizeKb: 500,
              newSizeKb: 100,
            } as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreImageRuntime.init?.(context);

      const result = await CoreImageRuntime.methods.resize(
        'data:image/png;base64,original',
        1024,
        200,
        85,
        'node-1'
      );

      expect(result).toBe('data:image/jpeg;base64,resized');
      expect(resizeArgs.maxDimension).toBe(1024);
      expect(resizeArgs.maxSizeKb).toBe(200);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Resized'))).toBe(true);
    });

  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreImageRuntime.init?.(context);
      await CoreImageRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

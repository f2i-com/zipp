/**
 * Tests for Core Audio Module Runtime
 *
 * Tests text-to-speech, speech-to-text, and audio manipulation.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext, createMockTauriInvoke } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreAudioRuntime from '../core-audio/runtime.js';

// Mock global fetch for service availability checks
const originalFetch = global.fetch;

describe('CoreAudioRuntime', () => {
  beforeEach(async () => {
    await CoreAudioRuntime.cleanup?.();
    // Reset fetch mock
    global.fetch = originalFetch;
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('resolveServiceUrl', () => {
    it('should return user URL when provided', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.resolveServiceUrl(
        'whisperx-stt',
        'http://127.0.0.1:8770/transcribe'
      );

      expect(result).toBe('http://127.0.0.1:8770/transcribe');
    });

    it('should return user URL for custom endpoint', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.resolveServiceUrl(
        'whisperx-stt',
        'https://custom.api.com/transcribe'
      );

      expect(result).toBe('https://custom.api.com/transcribe');
    });

    it('should throw error when no user URL provided', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      await expect(
        CoreAudioRuntime.methods.resolveServiceUrl('unknown-service')
      ).rejects.toThrow('No API URL provided for service');
    });

    it('should return user URL for any service when provided', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.resolveServiceUrl(
        'unknown-service',
        'https://custom.api.com/endpoint'
      );

      expect(result).toBe('https://custom.api.com/endpoint');
    });

    it('should use service port from Tauri when healthy', async () => {
      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'ensure_service_ready_by_port') {
            return { success: true, port: 9999, already_running: true } as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.resolveServiceUrl(
        'chatterbox-tts',
        'http://127.0.0.1:8765/tts'
      );

      expect(result).toBe('http://127.0.0.1:9999/tts');
    });
  });

  describe('textToSpeech', () => {
    it('should throw error when no text provided', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      // Mock fetch for health check
      global.fetch = async () => new Response('{"status":"ok"}', { status: 200 });
      await CoreAudioRuntime.init?.(context);

      // New signature: (text, apiUrl, responseFormat, description, outputFormat, filename, nodeId, audioPromptPath?, speaker?, language?)
      await expect(
        CoreAudioRuntime.methods.textToSpeech(
          '',                           // text
          'http://localhost:8765/tts',  // apiUrl
          'json',                       // responseFormat
          '',                           // description
          'wav',                        // outputFormat
          'output',                     // filename
          'node-1'                      // nodeId
        )
      ).rejects.toThrow('No text provided');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should throw error when Tauri not available', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      // Mock fetch for health check
      global.fetch = async () => new Response('{"status":"ok"}', { status: 200 });
      await CoreAudioRuntime.init?.(context);

      // New signature: (text, apiUrl, responseFormat, description, outputFormat, filename, nodeId, audioPromptPath?, speaker?, language?)
      await expect(
        CoreAudioRuntime.methods.textToSpeech(
          'Hello world',                // text
          'http://localhost:8765/tts',  // apiUrl
          'json',                       // responseFormat
          '',                           // description
          'wav',                        // outputFormat
          'output',                     // filename
          'node-1'                      // nodeId
        )
      ).rejects.toThrow('Tauri not available');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should handle JSON response format', async () => {
      let fetchCalled = false;
      global.fetch = async (url: RequestInfo | URL, _init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/health')) {
          return new Response('{"status":"ok"}', { status: 200 });
        }
        if (urlStr.includes('/tts')) {
          fetchCalled = true;
          return new Response(
            JSON.stringify({
              success: true,
              audio_path: 'C:/temp/generated.wav',
              duration_ms: 2500,
            }),
            { status: 200 }
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|get_app_data_dir') {
            return 'C:/AppData' as T;
          }
          if (cmd === 'plugin:zipp-filesystem|native_copy_file') {
            return 0 as T;
          }
          if (cmd === 'get_media_url') {
            return 'http://127.0.0.1:8080/media/output.wav' as T;
          }
          throw new Error('Unknown command: ' + cmd);
        },
      });
      await CoreAudioRuntime.init?.(context);

      // New signature: (text, apiUrl, responseFormat, description, outputFormat, filename, nodeId, audioPromptPath?, speaker?, language?)
      const result = await CoreAudioRuntime.methods.textToSpeech(
        'Hello world',                // text
        'http://localhost:8765/tts',  // apiUrl
        'json',                       // responseFormat
        'A friendly voice',           // description
        'wav',                        // outputFormat
        'test',                       // filename
        'node-1'                      // nodeId
      );

      expect(fetchCalled).toBe(true);
      expect(result.audio).toBeDefined();
      expect(result.path).toBeDefined();
      expect(result.durationMs).toBe(2500);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Generated audio'))).toBe(true);
    });
  });

  describe('saveAudio', () => {
    it('should throw error when no audio path provided', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreAudioRuntime.init?.(context);

      await expect(
        CoreAudioRuntime.methods.saveAudio('', 'output', '', 'wav', false, 'node-1')
      ).rejects.toThrow('No audio path provided');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should throw error when Tauri not available', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      await expect(
        CoreAudioRuntime.methods.saveAudio('C:/audio.wav', 'output', '', 'wav', false, 'node-1')
      ).rejects.toThrow('Tauri not available');
    });

    it('should save audio file to specified location', async () => {
      let copyArgs: Record<string, unknown> = {};
      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|get_app_data_dir') {
            return 'C:/AppData' as T;
          }
          if (cmd === 'plugin:zipp-filesystem|native_copy_file') {
            copyArgs = args || {};
            return 0 as T;
          }
          if (cmd === 'get_media_url') {
            return 'http://127.0.0.1:8080/media/saved.wav' as T;
          }
          throw new Error('Unknown command: ' + cmd);
        },
      });
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.saveAudio(
        'C:/temp/source.wav',
        'saved_audio',
        'C:/output',
        'wav',
        false,
        'node-1'
      );

      expect(copyArgs.source).toBe('C:/temp/source.wav');
      expect(copyArgs.destination).toBe('C:/output/saved_audio.wav');
      expect(result.path).toBeDefined();
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Audio saved'))).toBe(true);
    });
  });

  describe('speechToText', () => {
    it('should throw error when no media file provided', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      global.fetch = async () => new Response('{"status":"ok"}', { status: 200 });
      await CoreAudioRuntime.init?.(context);

      await expect(
        CoreAudioRuntime.methods.speechToText(
          '',
          'http://localhost:8766/transcribe',
          null,
          true,
          false,
          null,
          null,
          null,
          null,
          'node-1'
        )
      ).rejects.toThrow('No media file provided');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should transcribe audio successfully', async () => {
      let transcribeUrl = '';
      global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/health')) {
          return new Response('{"status":"ok"}', { status: 200 });
        }
        if (urlStr.includes('/transcribe')) {
          transcribeUrl = urlStr;
          const body = JSON.parse(init?.body as string);
          return new Response(
            JSON.stringify({
              success: true,
              language: body.language || 'en',
              duration: 30.5,
              segments: [
                { start: 0, end: 5, text: 'Hello world' },
                { start: 5, end: 10, text: 'How are you' },
              ],
              text: 'Hello world How are you',
              word_count: 5,
            }),
            { status: 200 }
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const { context, logs, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|get_app_data_dir') {
            return 'C:/AppData' as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.speechToText(
        'C:/audio/recording.wav',
        'http://localhost:8766/transcribe',
        'en',
        true,
        false,
        null,
        null,
        null,
        null,
        'node-1'
      );

      expect(transcribeUrl).toContain('/transcribe');
      expect(result.text).toBe('Hello world How are you');
      expect(result.segments).toHaveLength(2);
      expect(result.language).toBe('en');
      expect(result.duration).toBe(30.5);
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('Transcription complete'))).toBe(true);
    });

    it('should resolve media URL to file path', async () => {
      let resolvedPath = '';
      global.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        resolvedPath = body.audio_path;
        return new Response(
          JSON.stringify({
            success: true,
            language: 'en',
            duration: 10,
            segments: [],
            text: 'test',
            word_count: 1,
          }),
          { status: 200 }
        );
      };

      const { context } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|get_app_data_dir') {
            return 'C:/AppData' as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreAudioRuntime.init?.(context);

      await CoreAudioRuntime.methods.speechToText(
        'http://127.0.0.1:8080/media/zipp-output/audio.wav',
        'http://localhost:8766/transcribe',
        null,
        false,
        false,
        null,
        null,
        null,
        null,
        'node-1'
      );

      expect(resolvedPath).toBe('C:/AppData/output/audio.wav');
    });
  });

  describe('getAudioDuration', () => {
    it('should return 0 for empty path', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.getAudioDuration('');

      expect(result).toBe(0);
      expect(logs.some((l) => l.message.includes('No audio path provided'))).toBe(true);
    });

    it('should return 0 when Tauri not available', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.getAudioDuration('C:/audio.wav');

      expect(result).toBe(0);
      expect(logs.some((l) => l.message.includes('Tauri not available'))).toBe(true);
    });

    it('should return duration using ffprobe', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|run_command') {
            return { code: 0, stdout: '15.5\n', stderr: '' } as T;
          }
          if (cmd === 'plugin:zipp-filesystem|get_app_data_dir') {
            return 'C:/AppData' as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.getAudioDuration('C:/audio.wav');

      expect(result).toBe(15500); // 15.5 seconds = 15500ms
      expect(logs.some((l) => l.message.includes('Duration: 15.5s'))).toBe(true);
    });

    it('should handle ffprobe errors', async () => {
      const { context, logs } = createMockRuntimeContext({
        tauriInvoke: async <T>(cmd: string): Promise<T> => {
          if (cmd === 'plugin:zipp-filesystem|run_command') {
            return { code: 1, stdout: '', stderr: 'File not found' } as T;
          }
          if (cmd === 'plugin:zipp-filesystem|get_app_data_dir') {
            return 'C:/AppData' as T;
          }
          throw new Error('Unknown command');
        },
      });
      await CoreAudioRuntime.init?.(context);

      const result = await CoreAudioRuntime.methods.getAudioDuration('C:/nonexistent.wav');

      expect(result).toBe(0);
      expect(logs.some((l) => l.message.includes('ffprobe failed'))).toBe(true);
    });
  });

  describe('appendAudio', () => {
    it('should throw error when no audio files provided', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext({
        tauriInvoke: createMockTauriInvoke({}),
      });
      await CoreAudioRuntime.init?.(context);

      await expect(
        CoreAudioRuntime.methods.appendAudio([], 'output', 'wav', 'node-1')
      ).rejects.toThrow('No audio files provided');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should throw error when Tauri not available', async () => {
      const { context } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);

      await expect(
        CoreAudioRuntime.methods.appendAudio(['audio1.wav', 'audio2.wav'], 'output', 'wav', 'node-1')
      ).rejects.toThrow('Tauri not available');
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreAudioRuntime.init?.(context);
      await CoreAudioRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});

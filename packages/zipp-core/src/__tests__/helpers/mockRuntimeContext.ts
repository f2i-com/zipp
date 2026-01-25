/**
 * Mock RuntimeContext factory for testing module runtime methods.
 */

import type { RuntimeContext } from '../../module-types.js';

export interface MockRuntimeContextOptions {
  settings?: Record<string, unknown>;
  moduleSettings?: Record<string, unknown>;
  constants?: Record<string, string>;
  fetchResponse?: Response | ((url: string, options?: RequestInit) => Promise<Response>);
  tauriInvoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  abortSignal?: AbortSignal;
  runSubflowResult?: unknown;
}

export interface MockRuntimeContextResult {
  context: RuntimeContext;
  logs: Array<{ level: string; message: string }>;
  nodeStatuses: Array<{ nodeId: string; status: string }>;
  streamedTokens: Array<{ nodeId: string; token: string }>;
  images: Array<{ nodeId: string; imageUrl: string }>;
  database: {
    documents: Map<string, { collection: string; data: Record<string, unknown>; created_at: string }>;
  };
}

let documentIdCounter = 0;

export function createMockRuntimeContext(
  options: MockRuntimeContextOptions = {}
): MockRuntimeContextResult {
  const logs: Array<{ level: string; message: string }> = [];
  const nodeStatuses: Array<{ nodeId: string; status: string }> = [];
  const streamedTokens: Array<{ nodeId: string; token: string }> = [];
  const images: Array<{ nodeId: string; imageUrl: string }> = [];
  const documents = new Map<string, { collection: string; data: Record<string, unknown>; created_at: string }>();

  const defaultFetch = async (url: string, _options?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify({ url, mocked: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const context: RuntimeContext = {
    log: (level, message) => {
      logs.push({ level, message });
    },
    settings: options.settings ?? {},
    getModuleSetting: (key) => options.moduleSettings?.[key],
    tauri: options.tauriInvoke
      ? { invoke: options.tauriInvoke }
      : undefined,
    abortSignal: options.abortSignal,
    onStreamToken: (nodeId, token) => {
      streamedTokens.push({ nodeId, token });
    },
    onImage: (nodeId, imageUrl) => {
      images.push({ nodeId, imageUrl });
    },
    onNodeStatus: (nodeId, status) => {
      nodeStatuses.push({ nodeId, status });
    },
    fetch: typeof options.fetchResponse === 'function'
      ? options.fetchResponse
      : options.fetchResponse
        ? async () => options.fetchResponse as Response
        : defaultFetch,
    secureFetch: typeof options.fetchResponse === 'function'
      ? options.fetchResponse
      : options.fetchResponse
        ? async () => options.fetchResponse as Response
        : defaultFetch,
    getConstant: (name) => options.constants?.[name],
    runSubflow: options.runSubflowResult !== undefined
      ? async () => options.runSubflowResult
      : undefined,
    database: {
      insertDocument: async (collection, data, id?) => {
        const docId = id ?? `doc_${++documentIdCounter}`;
        documents.set(docId, {
          collection,
          data,
          created_at: new Date().toISOString(),
        });
        return docId;
      },
      findDocuments: async (collection, filter?) => {
        const results: Array<{ id: string; data: Record<string, unknown>; created_at: string }> = [];
        for (const [id, doc] of documents) {
          if (doc.collection !== collection) continue;
          if (filter) {
            let matches = true;
            for (const [key, value] of Object.entries(filter)) {
              if (doc.data[key] !== value) {
                matches = false;
                break;
              }
            }
            if (!matches) continue;
          }
          results.push({ id, data: doc.data, created_at: doc.created_at });
        }
        return results;
      },
      updateDocument: async (id, data) => {
        const doc = documents.get(id);
        if (!doc) return false;
        doc.data = { ...doc.data, ...data };
        return true;
      },
      deleteDocument: async (id) => {
        return documents.delete(id);
      },
    },
  };

  return {
    context,
    logs,
    nodeStatuses,
    streamedTokens,
    images,
    database: { documents },
  };
}

/**
 * Create a mock fetch response for testing.
 */
export function createMockFetchResponse(
  body: unknown,
  options: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, headers = {} } = options;
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', 'application/json');
  }

  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(bodyString, { status, headers: responseHeaders });
}

/**
 * Create a mock streaming response for testing AI streaming.
 */
export function createMockStreamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/**
 * Create a mock Tauri invoke function for testing native plugin calls.
 */
export function createMockTauriInvoke(
  responses: Record<string, unknown>
): <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> {
  return async <T>(cmd: string, _args?: Record<string, unknown>): Promise<T> => {
    if (cmd in responses) {
      return responses[cmd] as T;
    }
    throw new Error(`Unknown Tauri command: ${cmd}`);
  };
}

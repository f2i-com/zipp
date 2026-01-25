// Zipp Runtime - Executes FormLogic scripts with agentic capabilities
import {
  FormLogicEngine,
  createEngine,
  StringObject,
  PromiseObject,
} from 'formlogic-lang';
import type { BaseObject, FormLogicModuleFn } from 'formlogic-lang';
import { ZippCompiler } from './compiler';
import { extractDeepValue } from './formlogic-types';
import { AbortError } from './errors.js';
import type { WorkflowGraph, StreamCallback, LogCallback, ImageCallback, NodeStatusCallback, Flow, DatabaseCallback, WorkflowInputs, LocalNetworkPermissionCallback, ProjectSettings } from './types';
import type { RuntimeModule, RuntimeContext, ModuleRegistry, LoadedModule } from './module-types';
import { BoundedMap } from './runtime/BoundedMap.js';
import { baseObjectToJsValue, jsValueToBaseObject } from './runtime/ValueConverter.js';
import {
  isLocalNetworkUrl as isLocalNetworkUrlUtil,
  getHostPort as getHostPortUtil,
  isUrlWhitelisted as isUrlWhitelistedUtil,
} from './runtime/NetworkUtils.js';
import {
  createAbortModule,
  createUtilityModule,
  createAgentModule,
} from './runtime/BuiltinModules.js';
import { runtimeLogger } from './logger.js';

/**
 * Configuration options for ZippRuntime.
 * Use this interface to configure the runtime at construction time.
 *
 * @example
 * ```typescript
 * const runtime = createRuntime({
 *   callbacks: {
 *     onToken: (nodeId, token) => process.stdout.write(token),
 *     onLog: (entry) => console.log(entry.message),
 *   },
 *   abortSignal: controller.signal,
 * });
 * ```
 */
export interface RuntimeConfig {
  /** Callback functions for runtime events */
  callbacks?: {
    /** Called when AI nodes stream tokens */
    onToken?: StreamCallback;
    /** Called for log messages during execution */
    onLog?: LogCallback;
    /** Called when images are generated */
    onImage?: ImageCallback;
    /** Called when node execution status changes */
    onNodeStatus?: NodeStatusCallback;
    /** Called for database operations */
    onDatabase?: DatabaseCallback;
    /** Called when local network access is requested */
    onLocalNetworkPermission?: LocalNetworkPermissionCallback;
  };
  /** AbortSignal for cancelling workflow execution */
  abortSignal?: AbortSignal;
  /** Module registry for dynamic node support */
  moduleRegistry?: ModuleRegistry;
  /** Available flows for subflow execution */
  flows?: Flow[];
  /** Package macros (higher priority than project macros) */
  packageMacros?: Flow[];
  /** Project settings including local network whitelist */
  projectSettings?: ProjectSettings;
  /** Module-specific settings */
  moduleSettings?: Record<string, Record<string, unknown>>;
}

// Tauri API for native HTTP requests (bypasses browser security restrictions)
declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

/**
 * ZippRuntime executes compiled FormLogic scripts with agentic workflow capabilities.
 *
 * Features:
 * - Module system with 12 built-in modules (AI, browser, filesystem, etc.)
 * - Streaming output via callbacks
 * - Agent memory with LRU eviction and persistence
 * - Network security (SSRF protection, local network whitelisting)
 * - Abort signal support for cancellation
 *
 * @example
 * ```typescript
 * const runtime = createRuntime(
 *   (nodeId, token) => console.log(`[${nodeId}] ${token}`),  // onToken
 *   (entry) => console.log(entry.message),                    // onLog
 *   undefined,                                                 // onImage
 *   (nodeId, status) => console.log(`${nodeId}: ${status}`), // onNodeStatus
 *   abortController.signal                                    // abortSignal
 * );
 *
 * runtime.setAvailableFlows(flows);
 * const result = await runtime.execute(compiledScript);
 * ```
 *
 * @see {@link ZippCompiler} for compiling workflow graphs
 * @see {@link createRuntime} factory function
 */

// Special table name for persisting agent memory
const AGENT_MEMORY_TABLE = '_agent_memory';

export class ZippRuntime {
  private engine: FormLogicEngine;
  private onToken: StreamCallback | null = null;
  private onLog: LogCallback | null = null;
  private onImage: ImageCallback | null = null;
  private onNodeStatus: NodeStatusCallback | null = null;
  private onDatabase: DatabaseCallback | null = null;
  private onLocalNetworkPermission: LocalNetworkPermissionCallback | null = null;
  private abortSignal: AbortSignal | null = null;
  private agentMemory: BoundedMap<string, string | number | boolean | object> = new BoundedMap({
    maxEntries: 1000,      // Max 1000 memory keys
    maxValueSize: 1024 * 1024, // Max 1MB per value
  });
  private agentMemoryLoaded: boolean = false; // Track if we've loaded persisted memory
  private moduleRegistry: ModuleRegistry | null = null; // Module registry for dynamic modules
  private loadedRuntimeModules: Map<string, RuntimeModule> = new Map(); // Loaded runtime modules
  private moduleSettings: Record<string, Record<string, unknown>> = {}; // Module settings
  private availableFlows: Flow[] = []; // Available flows for subflow execution
  private packageMacros: Flow[] = []; // Package macros (higher priority than project macros)
  private projectSettings: ProjectSettings = {}; // Project settings including local network whitelist

  // Per-flow database context
  private currentFlowId: string | null = null;
  private currentPackageId: string | null = null;

  // Claude-as-AI pattern: yield at AI nodes for external response
  private useClaudeForAI: boolean = false;
  private currentJobId: string | null = null;
  private onYieldForAI: ((request: {
    nodeId: string;
    systemPrompt: string;
    userPrompt: string;
    images?: string[];
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) => Promise<string>) | null = null;

  /**
   * Create a new ZippRuntime instance.
   *
   * Supports two calling conventions:
   * 1. Configuration object (recommended):
   *    ```typescript
   *    new ZippRuntime({
   *      callbacks: { onToken, onLog },
   *      abortSignal: controller.signal,
   *    })
   *    ```
   *
   * 2. Legacy positional parameters (deprecated, for backward compatibility):
   *    ```typescript
   *    new ZippRuntime(onToken, onLog, onImage, onNodeStatus, abortSignal, onDatabase, onLocalNetworkPermission)
   *    ```
   */
  constructor(configOrOnToken?: RuntimeConfig | StreamCallback, ...legacyArgs: unknown[]) {
    this.engine = createEngine();

    // Detect which calling convention is being used
    if (configOrOnToken && typeof configOrOnToken === 'object' && !('call' in configOrOnToken)) {
      // New configuration object style
      const config = configOrOnToken as RuntimeConfig;
      this.onToken = config.callbacks?.onToken || null;
      this.onLog = config.callbacks?.onLog || null;
      this.onImage = config.callbacks?.onImage || null;
      this.onNodeStatus = config.callbacks?.onNodeStatus || null;
      this.onDatabase = config.callbacks?.onDatabase || null;
      this.onLocalNetworkPermission = config.callbacks?.onLocalNetworkPermission || null;
      this.abortSignal = config.abortSignal || null;
      this.moduleRegistry = config.moduleRegistry || null;
      this.availableFlows = config.flows || [];
      this.packageMacros = config.packageMacros || [];
      this.projectSettings = config.projectSettings || {};
      this.moduleSettings = config.moduleSettings || {};
    } else {
      // Legacy positional parameters style
      this.onToken = (configOrOnToken as StreamCallback) || null;
      this.onLog = (legacyArgs[0] as LogCallback) || null;
      this.onImage = (legacyArgs[1] as ImageCallback) || null;
      this.onNodeStatus = (legacyArgs[2] as NodeStatusCallback) || null;
      this.abortSignal = (legacyArgs[3] as AbortSignal) || null;
      this.onDatabase = (legacyArgs[4] as DatabaseCallback) || null;
      this.onLocalNetworkPermission = (legacyArgs[5] as LocalNetworkPermissionCallback) || null;
    }

    // Register built-in system modules
    this.registerBuiltinModules();

    // Runtime modules are loaded dynamically via registerDynamicModule()
    // See modules/*/runtime.ts for module implementations
  }

  /**
   * Set project settings (including local network whitelist)
   */
  setProjectSettings(settings: ProjectSettings): void {
    this.projectSettings = settings;
  }

  /**
   * Set the current flow context for per-flow database operations
   * This determines which database file is used for database operations
   * (Agent memory always uses the shared database for cross-flow persistence)
   */
  setFlowContext(flowId: string | null, packageId?: string | null): void {
    this.currentFlowId = flowId;
    this.currentPackageId = packageId || null;
    if (flowId) {
      runtimeLogger.debug(`Flow context set: flowId=${flowId}${packageId ? `, packageId=${packageId}` : ''}`);
    }
  }

  /**
   * Configure Claude-as-AI mode where AI nodes yield for external response
   * @param enabled Whether to enable Claude-as-AI mode
   * @param jobId The current job ID (needed for yield callback)
   * @param yieldCallback Callback to invoke when yielding at an AI node
   */
  setClaudeAsAI(
    enabled: boolean,
    jobId: string | null,
    yieldCallback: ((request: {
      nodeId: string;
      systemPrompt: string;
      userPrompt: string;
      images?: string[];
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }) => Promise<string>) | null
  ): void {
    this.useClaudeForAI = enabled;
    this.currentJobId = jobId;
    this.onYieldForAI = yieldCallback;
    if (enabled) {
      runtimeLogger.debug(`Claude-as-AI mode enabled for job: ${jobId}`);
    }
  }

  /**
   * Get the current flow context
   */
  getFlowContext(): { flowId: string | null; packageId: string | null } {
    return { flowId: this.currentFlowId, packageId: this.currentPackageId };
  }

  /**
   * Add an address to the local network whitelist at runtime
   * This is used to immediately update the whitelist when user approves with "remember",
   * avoiding double prompts before React state propagates back
   */
  addToLocalNetworkWhitelist(hostPort: string): void {
    const currentWhitelist = this.projectSettings.localNetworkWhitelist || [];
    if (!currentWhitelist.includes(hostPort)) {
      this.projectSettings = {
        ...this.projectSettings,
        localNetworkWhitelist: [...currentWhitelist, hostPort],
      };
    }
  }

  /**
   * Check if a URL is a local/private network address
   */
  private isLocalNetworkUrl(url: string): boolean {
    return isLocalNetworkUrlUtil(url);
  }

  /**
   * Get the host:port string from a URL for whitelist matching
   */
  private getHostPort(url: string): string {
    return getHostPortUtil(url);
  }

  /**
   * Check if a URL is allowed by the whitelist or global override
   */
  private isUrlWhitelisted(url: string): boolean {
    return isUrlWhitelistedUtil(
      url,
      this.projectSettings.localNetworkWhitelist || [],
      this.projectSettings.allowAllLocalNetwork
    );
  }

  /**
   * Perform an HTTP request (used by Utility.httpRequest)
   * Uses Tauri's HTTP client if available, otherwise falls back to fetch
   */
  private async performHttpRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const isLocalNetwork = this.isLocalNetworkUrl(url);

    // For local network URLs, check whitelist
    if (isLocalNetwork && !this.isUrlWhitelisted(url)) {
      // Try to get permission if callback available
      if (this.onLocalNetworkPermission) {
        const hostPort = this.getHostPort(url);
        const response = await this.onLocalNetworkPermission({
          url,
          hostPort,
          purpose: 'HTTP request from workflow',
        });

        if (!response.allowed) {
          throw new Error(`Local network access denied for ${hostPort}`);
        }

        if (response.remember) {
          this.addToLocalNetworkWhitelist(hostPort);
        }
      } else {
        throw new Error(`Local network access to ${this.getHostPort(url)} is not allowed`);
      }
    }

    // Use Tauri's HTTP client if available
    if (typeof window !== 'undefined' && window.__TAURI__) {
      const result = await window.__TAURI__.core.invoke<{
        status: number;
        headers: Record<string, string>;
        body: string;
        url: string;
        bodyIsBase64?: boolean;
      }>('http_request', {
        request: {
          url,
          method,
          headers,
          body: body || null,
          follow_redirects: true,
          max_redirects: 10,
          allow_private_networks: isLocalNetwork,
        }
      });

      return {
        status: result.status,
        headers: result.headers,
        body: result.body,
      };
    }

    // Fallback to browser fetch
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body) {
      fetchOptions.body = body;
    }

    if (this.abortSignal) {
      fetchOptions.signal = this.abortSignal;
    }

    const response = await fetch(url, fetchOptions);
    const responseBody = await response.text();

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  }

  /**
   * Load persisted agent memory from SQLite database
   * Called automatically on first memory access if database callback is available
   */
  private async loadPersistedMemory(): Promise<void> {
    if (this.agentMemoryLoaded || !this.onDatabase) {
      return;
    }

    this.agentMemoryLoaded = true;

    try {
      const result = await this.onDatabase({
        operation: 'query',
        storageType: 'collection',
        collectionName: AGENT_MEMORY_TABLE,
      });

      if (result.success && result.data && Array.isArray(result.data)) {
        for (const doc of result.data as Array<{ key: string; value: unknown }>) {
          if (doc.key && doc.value !== undefined) {
            // Parse the stored JSON value
            try {
              const value = typeof doc.value === 'string' ? JSON.parse(doc.value) : doc.value;
              this.agentMemory.set(doc.key, value as string | number | boolean | object);
            } catch {
              // If JSON parse fails, use the raw value
              this.agentMemory.set(doc.key, doc.value as string | number | boolean | object);
            }
          }
        }
        if (this.onLog) {
          this.onLog({ source: 'Agent', message: `Loaded ${result.data.length} persisted memory entries`, type: 'info' });
        }
      }
    } catch (err) {
      if (this.onLog) {
        this.onLog({ source: 'Agent', message: `Failed to load persisted memory: ${err}`, type: 'error' });
      }
    }
  }

  /**
   * Persist a memory key-value pair to SQLite database
   */
  private async persistMemoryEntry(key: string, value: unknown): Promise<void> {
    if (!this.onDatabase) {
      return;
    }

    try {
      // Serialize the value as JSON
      const serializedValue = JSON.stringify(value);

      // First, delete any existing entry with this key
      await this.onDatabase({
        operation: 'delete',
        storageType: 'collection',
        collectionName: AGENT_MEMORY_TABLE,
        filter: { key },
      });

      // Then insert the new value
      await this.onDatabase({
        operation: 'insert',
        storageType: 'collection',
        collectionName: AGENT_MEMORY_TABLE,
        data: { key, value: serializedValue },
      });
    } catch (err) {
      if (this.onLog) {
        this.onLog({ source: 'Agent', message: `Failed to persist memory entry '${key}': ${err}`, type: 'error' });
      }
    }
  }

  /**
   * Delete a persisted memory entry from SQLite database
   */
  private async deletePersistedMemoryEntry(key: string): Promise<void> {
    if (!this.onDatabase) {
      return;
    }

    try {
      await this.onDatabase({
        operation: 'delete',
        storageType: 'collection',
        collectionName: AGENT_MEMORY_TABLE,
        filter: { key },
      });
    } catch (err) {
      if (this.onLog) {
        this.onLog({ source: 'Agent', message: `Failed to delete persisted memory entry '${key}': ${err}`, type: 'error' });
      }
    }
  }

  /**
   * Register built-in system modules (Abort, Agent, Utility)
   */
  private registerBuiltinModules(): void {
    // Abort module - allows checking if workflow was aborted
    this.engine.registerModule('Abort', createAbortModule({
      abortSignal: this.abortSignal,
    }));

    // Utility module - provides utility functions for compiled code
    this.engine.registerModule('Utility', createUtilityModule({
      performHttpRequest: this.performHttpRequest.bind(this),
    }));

    // Agent module - for agent memory (history, context)
    this.engine.registerModule('Agent', createAgentModule({
      agentMemory: this.agentMemory,
      loadPersistedMemory: this.loadPersistedMemory.bind(this),
      persistMemoryEntry: this.persistMemoryEntry.bind(this),
      deletePersistedMemoryEntry: this.deletePersistedMemoryEntry.bind(this),
      onLog: this.onLog,
    }));
  }

  /**
   * Set the module registry for dynamic node support
   */
  setModuleRegistry(registry: ModuleRegistry): void {
    this.moduleRegistry = registry;
  }

  /**
   * Set module settings (key-value pairs for each module)
   */
  setModuleSettings(settings: Record<string, Record<string, unknown>>): void {
    this.moduleSettings = settings;
  }

  /**
   * Set available flows for subflow execution
   */
  setAvailableFlows(flows: Flow[]): void {
    this.availableFlows = flows;
  }

  /**
   * Set package macros (higher priority than project macros)
   * These are macros embedded in a .zipp package
   */
  setPackageMacros(macros: Flow[]): void {
    this.packageMacros = macros;
  }

  /**
   * Clear package macros (call when closing a package)
   */
  clearPackageMacros(): void {
    this.packageMacros = [];
  }

  /**
   * Find a flow or macro by ID, checking package macros first
   */
  private findFlowOrMacro(flowId: string): Flow | undefined {
    // Check package macros first (higher priority)
    const packageMacro = this.packageMacros.find(f => f.id === flowId);
    if (packageMacro) {
      return packageMacro;
    }
    // Then check available flows (includes project macros)
    return this.availableFlows.find(f => f.id === flowId);
  }

  /**
   * Execute a subflow by ID
   */
  private async executeSubflow(flowId: string, inputs: Record<string, unknown>): Promise<unknown> {
    // Check package macros first, then available flows
    const flow = this.findFlowOrMacro(flowId);
    if (!flow) {
      throw new Error(`Subflow not found: ${flowId}`);
    }

    runtimeLogger.debug(`executeSubflow: compiling flow ${flowId} (${flow.name || 'unnamed'})`);
    runtimeLogger.debug(`executeSubflow: graph has ${flow.graph.nodes.length} nodes, ${flow.graph.edges.length} edges`);

    // Compile and run the subflow's graph
    const compiler = new ZippCompiler();
    compiler.setAvailableFlows(this.availableFlows);
    // Pass package macros to compiler for nested macro resolution
    if (this.packageMacros.length > 0) {
      compiler.setPackageMacros(this.packageMacros);
    }
    if (this.moduleRegistry) {
      compiler.setModuleRegistry(this.moduleRegistry);
    }
    // Pass project settings to compiler for default provider configuration
    compiler.setProjectSettings(this.projectSettings);

    // Compile the subflow graph with inputs (cast to WorkflowInputs)
    const script = compiler.compile(flow.graph, inputs as WorkflowInputs);

    try {
      const result = await this.engine.run(script);

      // Extract the __output__ value from the result using deep extraction
      if (result && typeof result === 'object' && 'pairs' in result) {
        const pairs = (result as { pairs: Map<string, unknown> }).pairs;
        const outputKey = 'string:__output__';
        if (pairs.has(outputKey)) {
          const outputVal = pairs.get(outputKey);
          // Use extractDeepValue for proper extraction of nested FormLogic objects
          return extractDeepValue(outputVal);
        }
      }

      // Fallback: extract from the entire result
      return extractDeepValue(result);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      throw new Error(`Subflow execution failed: ${error}`);
    }
  }

  /**
   * Register a dynamic runtime module from a LoadedModule
   */
  async registerDynamicModule(loadedModule: LoadedModule): Promise<void> {
    const runtimeModule = loadedModule.runtime;
    if (!runtimeModule) {
      return; // No runtime component
    }

    // Create runtime context for this module
    const context: RuntimeContext = {
      log: (level, message) => {
        if (this.onLog) {
          // Map RuntimeContext log levels to LogEntry types
          const typeMap: Record<string, 'info' | 'error' | 'success' | 'node'> = {
            info: 'info',
            warn: 'info', // 'warn' maps to 'info' since LogEntry doesn't have 'warn'
            error: 'error',
            success: 'success',
          };
          this.onLog({
            source: loadedModule.manifest.name,
            message,
            type: typeMap[level] || 'info',
          });
        }
      },
      settings: this.moduleSettings[loadedModule.manifest.id] || {},
      getModuleSetting: (key) => {
        const moduleSettings = this.moduleSettings[loadedModule.manifest.id] || {};
        return moduleSettings[key];
      },
      abortSignal: this.abortSignal || undefined,
      // HTTP fetch with abort signal support (no SSRF protection - use secureFetch for that)
      fetch: (url: string, options?: RequestInit) => {
        const fetchOptions = { ...options };
        if (this.abortSignal && !fetchOptions.signal) {
          fetchOptions.signal = this.abortSignal;
        }
        return fetch(url, fetchOptions);
      },
      // Secure HTTP fetch that uses Tauri's HTTP client with SSRF protection
      // Local network access is controlled by project settings whitelist
      secureFetch: async (url: string, options?: RequestInit & { nodeId?: string; purpose?: string }) => {
        const isLocalNetwork = this.isLocalNetworkUrl(url);
        let allowLocal = false;

        // Check if local network access is needed and allowed
        if (isLocalNetwork) {
          // First check whitelist
          if (this.isUrlWhitelisted(url)) {
            allowLocal = true;
          } else if (this.onLocalNetworkPermission) {
            // Ask user for permission
            const hostPort = this.getHostPort(url);
            try {
              const response = await this.onLocalNetworkPermission({
                url,
                hostPort,
                nodeId: options?.nodeId,
                purpose: options?.purpose,
              });

              if (!response.allowed) {
                throw new Error(`Local network access denied for ${hostPort}`);
              }

              allowLocal = true;

              // Immediately update local whitelist to prevent double prompts
              // This handles the case where another request in the same workflow run
              // (e.g., 2nd LLM node or next loop iteration) checks before React state propagates
              if (response.remember) {
                this.addToLocalNetworkWhitelist(hostPort);
              }
            } catch (err) {
              // User denied or dialog was cancelled
              throw new Error(`Local network access denied for ${hostPort}: ${err instanceof Error ? err.message : 'User denied'}`);
            }
          } else {
            // No permission callback and not whitelisted - deny by default
            throw new Error(`Local network access to ${this.getHostPort(url)} is not allowed. Add it to the whitelist in Settings > Security.`);
          }
        }

        // If Tauri is available, use the secure HTTP client
        // Exception: FormData must use native fetch because Tauri can't serialize it
        const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;

        if (typeof window !== 'undefined' && window.__TAURI__ && !isFormData) {
          const headers: Record<string, string> = {};
          if (options?.headers) {
            if (options.headers instanceof Headers) {
              options.headers.forEach((value, key) => {
                headers[key] = value;
              });
            } else if (Array.isArray(options.headers)) {
              options.headers.forEach(([key, value]) => {
                headers[key] = value;
              });
            } else {
              Object.assign(headers, options.headers);
            }
          }

          const result = await window.__TAURI__.core.invoke<{
            status: number;
            headers: Record<string, string>;
            body: string;
            url: string;
            bodyIsBase64?: boolean;
          }>('http_request', {
            request: {
              url,
              method: options?.method || 'GET',
              headers,
              body: options?.body ? String(options.body) : null,
              follow_redirects: true,
              max_redirects: 10,
              allow_private_networks: allowLocal,
            }
          });

          // Convert to Response object for compatibility
          let responseBody: BodyInit = result.body;
          let binaryBytes: Uint8Array | null = null;

          // Decode Base64 body back to binary if needed (for images, PDFs, etc.)
          if (result.bodyIsBase64) {
            try {
              const binaryString = atob(result.body);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              responseBody = bytes;
              binaryBytes = bytes;
              runtimeLogger.debug(`secureFetch: Decoded base64 to ${bytes.length} bytes`);
            } catch (e) {
              // If Base64 decode fails, use original body as text
              runtimeLogger.warn(`secureFetch: Base64 decode failed: ${e}`);
              responseBody = result.body;
            }
          }

          // Create Response with proper headers
          const responseHeaders = new Headers(result.headers);
          const contentType = responseHeaders.get('content-type') || 'application/octet-stream';

          // If we have binary data, create a Blob directly for proper .blob() support
          if (binaryBytes) {
            // Cast to any to avoid TypeScript strict type checking on BlobPart
            const blob = new Blob([binaryBytes as unknown as BlobPart], { type: contentType });
            runtimeLogger.debug(`secureFetch: Created blob: size=${blob.size}, type=${blob.type}`);
            return new Response(blob, {
              status: result.status,
              headers: responseHeaders,
            });
          }

          return new Response(responseBody, {
            status: result.status,
            headers: responseHeaders,
          });
        }

        // Fallback to native fetch (no SSRF protection in browser-only mode)
        const fetchOptions = { ...options };
        if (this.abortSignal && !fetchOptions.signal) {
          fetchOptions.signal = this.abortSignal;
        }
        return fetch(url, fetchOptions);
      },
      // Streaming callbacks
      onStreamToken: this.onToken ? (nodeId, token) => this.onToken?.(nodeId, token) : undefined,
      onImage: this.onImage ? (nodeId, imageUrl) => this.onImage?.(nodeId, imageUrl) : undefined,
      onNodeStatus: this.onNodeStatus ? (nodeId, status) => this.onNodeStatus?.(nodeId, status) : undefined,
      // Subflow execution callback
      runSubflow: (flowId, inputs) => this.executeSubflow(flowId, inputs),
      // Claude-as-AI pattern
      useClaudeForAI: this.useClaudeForAI,
      currentJobId: this.currentJobId || undefined,
      yieldForAI: this.onYieldForAI || undefined,
    };

    // Add Tauri invoke if available
    if (typeof window !== 'undefined' && window.__TAURI__) {
      context.tauri = {
        invoke: window.__TAURI__.core.invoke,
      };
    }

    // Add database interface if callback is available
    // Database operations use the current flow context for per-flow isolation
    if (this.onDatabase) {
      const dbCallback = this.onDatabase;
      const getFlowContext = () => this.getFlowContext();
      const logContext = context.log;
      context.database = {
        insertDocument: async (collection, data, id) => {
          const { flowId, packageId } = getFlowContext();
          const result = await dbCallback({
            operation: 'insert',
            storageType: 'collection',
            collectionName: collection,
            data: id ? { ...data, _id: id } : data,
            flowId: flowId || undefined,
            packageId: packageId || undefined,
          });
          return result.insertedId?.toString() || '';
        },
        findDocuments: async (collection, filter) => {
          const { flowId, packageId } = getFlowContext();
          const result = await dbCallback({
            operation: 'query',
            storageType: 'collection',
            collectionName: collection,
            filter,
            flowId: flowId || undefined,
            packageId: packageId || undefined,
          });
          return (result.data || []).map((doc) => ({
            id: (doc._id || doc.id || '').toString(),
            data: doc as Record<string, unknown>,
            created_at: (doc._created || doc.created_at || new Date().toISOString()).toString(),
          }));
        },
        updateDocument: async (id, data) => {
          const { flowId, packageId } = getFlowContext();
          const result = await dbCallback({
            operation: 'update',
            storageType: 'collection',
            data,
            filter: { id },
            flowId: flowId || undefined,
            packageId: packageId || undefined,
          });
          return (result.rowsAffected || 0) > 0;
        },
        deleteDocument: async (id) => {
          const { flowId, packageId } = getFlowContext();
          const result = await dbCallback({
            operation: 'delete',
            storageType: 'collection',
            filter: { id },
            flowId: flowId || undefined,
            packageId: packageId || undefined,
          });
          return (result.rowsAffected || 0) > 0;
        },
      };
    }

    // Initialize the module if it has an init function
    if (runtimeModule.init) {
      await runtimeModule.init(context);
    }

    // Convert runtime methods to FormLogic module methods
    const methods: Record<string, FormLogicModuleFn> = {};

    for (const [methodName, methodFn] of Object.entries(runtimeModule.methods)) {
      const isStreaming = runtimeModule.streaming?.[methodName] || false;

      methods[methodName] = (args: BaseObject[]): BaseObject => {
        // Convert FormLogic objects to JS values
        const jsArgs = args.map((arg) => baseObjectToJsValue(arg));

        const promiseObj = new PromiseObject();

        // Execute the method
        const result = methodFn(...jsArgs);

        // Handle promise results
        if (result instanceof Promise) {
          result
            .then((value) => {
              const flValue = jsValueToBaseObject(value);
              promiseObj.resolve(flValue);
            })
            .catch((error) => {
              if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
                promiseObj.resolve(new StringObject('__ABORT__'));
                return;
              }
              promiseObj.resolve(new StringObject(`Error: ${error instanceof Error ? error.message : String(error)}`));
            });
          return promiseObj;
        }

        // Sync result
        return jsValueToBaseObject(result);
      };
    }

    // Register with FormLogic engine
    this.engine.registerModule(runtimeModule.name, methods);
    this.loadedRuntimeModules.set(loadedModule.manifest.id, runtimeModule);

    if (this.onLog) {
      this.onLog({
        source: 'ModuleLoader',
        message: `Registered dynamic module: ${runtimeModule.name}`,
        type: 'info',
      });
    }
  }

  /**
   * Cleanup all dynamic modules
   */
  async cleanupDynamicModules(): Promise<void> {
    for (const [, runtimeModule] of this.loadedRuntimeModules) {
      if (runtimeModule.cleanup) {
        try {
          await runtimeModule.cleanup();
        } catch (error) {
          runtimeLogger.error(`Error cleaning up module ${runtimeModule.name}: ${error}`);
        }
      }
    }
    this.loadedRuntimeModules.clear();
  }

  /**
   * Update node execution status
   */
  private setNodeStatus(nodeId: string, status: 'running' | 'completed' | 'error') {
    if (this.onNodeStatus) {
      this.onNodeStatus(nodeId, status);
    }
  }

  /**
   * Check if workflow has been aborted
   * @throws {AbortError} if the workflow has been aborted
   */
  private checkAborted(): void {
    if (this.abortSignal?.aborted) {
      throw new AbortError();
    }
  }

  /**
   * Log a message to the callback
   */
  private log(type: 'info' | 'error' | 'success', message: string) {
    if (this.onLog) {
      this.onLog({ source: 'System', message, type });
    }
  }

  /**
   * Utility delay function that respects abort signal
   * @throws {AbortError} if the workflow is aborted during the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.abortSignal?.aborted) {
        reject(new AbortError());
        return;
      }

      const timeoutId = setTimeout(resolve, ms);

      // Listen for abort during the delay
      if (this.abortSignal) {
        const abortHandler = () => {
          clearTimeout(timeoutId);
          reject(new AbortError());
        };
        this.abortSignal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  /**
   * Execute a workflow graph
   * @param graph The workflow graph to execute
   * @param availableFlows Optional list of flows for subflow resolution
   * @param inputs Optional inputs to pass to the workflow (for macros, wrap in __macro_inputs__)
   */
  async runWorkflow(graph: WorkflowGraph, availableFlows?: Flow[], inputs?: WorkflowInputs): Promise<BaseObject> {
    // Store available flows for subflow execution at runtime
    if (availableFlows) {
      this.availableFlows = availableFlows;
    }

    const compiler = new ZippCompiler();
    if (availableFlows) {
      compiler.setAvailableFlows(availableFlows);
    }
    // Pass package macros to compiler for macro resolution
    if (this.packageMacros.length > 0) {
      compiler.setPackageMacros(this.packageMacros);
    }
    // Connect module registry to compiler for dynamic node support
    if (this.moduleRegistry) {
      compiler.setModuleRegistry(this.moduleRegistry);
      // Debug: Log module registry state
      const modules = Array.from(this.moduleRegistry.modules.values());
      const modulesWithCompilers = modules.filter((m: LoadedModule) => m.compiler);
      this.log('info', `[Compiler] Module registry: ${modules.length} modules, ${modulesWithCompilers.length} with compilers`);
      for (const m of modulesWithCompilers) {
        const nodeTypes = Array.from(m.nodes.keys()).join(', ');
        this.log('info', `[Compiler] Module '${m.manifest.id}' has compiler '${m.compiler?.name}', nodes: [${nodeTypes}]`);
      }
    } else {
      this.log('info', `[Compiler] No module registry available!`);
    }
    // Pass project settings to compiler for default provider configuration
    compiler.setProjectSettings(this.projectSettings);

    // Debug: Log graph nodes being compiled
    const nodeTypes = graph.nodes.map(n => `${n.id}(${n.type})`).join(', ');
    this.log('info', `[Compiler] Compiling graph with nodes: [${nodeTypes}]`);

    const script = compiler.compile(graph, inputs);

    // Debug: Log generated script (first 2000 chars for debugging parse errors)
    this.log('info', `[Compiler] Generated script (first 2000 chars):\n${script.substring(0, 2000)}`);

    this.log('info', '--- Starting Workflow Execution ---');

    // Debug: log loop detection info from script comments
    const loopsMatch = script.match(/\/\/ Loops found: (\d+)/);
    const loopCountFromScript = loopsMatch ? loopsMatch[1] : 'unknown';
    this.log('info', `[Compiler] Loops detected: ${loopCountFromScript}`);

    // Log loop details
    const loopDetailMatches = script.matchAll(/\/\/ Loop ([^:]+): (\d+) inner nodes \[([^\]]*)\]/g);
    for (const match of loopDetailMatches) {
      this.log('info', `[Compiler] Loop ${match[1]}: ${match[2]} inner nodes [${match[3]}]`);
    }

    // Note: Script logging removed to prevent API key exposure
    // Enable only for debugging with: if (process.env.NODE_ENV === 'development') { ... }

    try {
      const result = await this.engine.run(script);
      this.log('success', '--- Workflow Completed Successfully ---');
      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      // Don't log abort errors - they'll be handled by the caller
      const isAbort = error.includes('__ABORT__') || error.includes('aborted');
      if (!isAbort) {
        this.log('error', `Workflow Error: ${error}`);
      }
      throw e;
    }
  }

  /**
   * Clear agent memory
   */
  clearMemory() {
    this.agentMemory.clear();
    this.log('info', '[Memory] Cleared');
  }

  /**
   * Get current memory state (for debugging)
   */
  getMemorySnapshot(): Record<string, string | number | boolean | object> {
    return Object.fromEntries(this.agentMemory);
  }

  /**
   * Convert a FormLogic BaseObject result to a plain JavaScript value
   * This is useful for displaying or serializing workflow results
   */
  convertResultToJs(result: unknown): unknown {
    // Check if it looks like a BaseObject (has FormLogic internal properties)
    if (result && typeof result === 'object') {
      // Handle BaseObject types
      if ('value' in result && (result as { value?: unknown }).value !== undefined) {
        return (result as { value: unknown }).value;
      }
      // Handle array-like BaseObjects
      if ('elements' in result && Array.isArray((result as { elements?: unknown[] }).elements)) {
        return (result as { elements: unknown[] }).elements.map((el) => this.convertResultToJs(el));
      }
      // Handle hash/object-like BaseObjects (FormLogic HashObject)
      if ('pairs' in result && (result as { pairs?: Map<string, unknown> }).pairs instanceof Map) {
        const jsResult: Record<string, unknown> = {};
        const pairs = (result as { pairs: Map<string, unknown> }).pairs;
        pairs.forEach((value, key) => {
          // FormLogic uses 'string:key' format for hash keys
          const cleanKey = key.startsWith('string:') ? key.slice(7) : key;
          jsResult[cleanKey] = this.convertResultToJs(value);
        });
        return jsResult;
      }
      // If it's a plain object (not a BaseObject), recursively convert its properties
      if (Object.getPrototypeOf(result) === Object.prototype) {
        const jsResult: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
          // Skip internal FormLogic properties
          if (key === '_marked' || key === 'proto') continue;
          jsResult[key] = this.convertResultToJs(value);
        }
        return jsResult;
      }
    }
    // Return primitives as-is
    return result;
  }
}

/**
 * Factory function to create a new ZippRuntime instance.
 *
 * Supports two calling conventions:
 *
 * 1. Configuration object (recommended):
 * @example
 * ```typescript
 * const runtime = createRuntime({
 *   callbacks: {
 *     onToken: (nodeId, token) => process.stdout.write(token),
 *     onLog: (entry) => console.log(entry.message),
 *   },
 *   abortSignal: controller.signal,
 *   moduleRegistry: registry,
 * });
 * ```
 *
 * 2. Legacy positional parameters (deprecated):
 * @example
 * ```typescript
 * const runtime = createRuntime(
 *   (nodeId, token) => process.stdout.write(token),
 *   (entry) => console.log(`[${entry.type}] ${entry.message}`)
 * );
 * ```
 *
 * @param configOrOnToken - Configuration object or onToken callback (legacy)
 * @returns A configured ZippRuntime instance
 */
export function createRuntime(config: RuntimeConfig): ZippRuntime;
export function createRuntime(
  onToken?: StreamCallback,
  onLog?: LogCallback,
  onImage?: ImageCallback,
  onNodeStatus?: NodeStatusCallback,
  abortSignal?: AbortSignal,
  onDatabase?: DatabaseCallback,
  onLocalNetworkPermission?: LocalNetworkPermissionCallback
): ZippRuntime;
export function createRuntime(
  configOrOnToken?: RuntimeConfig | StreamCallback,
  onLog?: LogCallback,
  onImage?: ImageCallback,
  onNodeStatus?: NodeStatusCallback,
  abortSignal?: AbortSignal,
  onDatabase?: DatabaseCallback,
  onLocalNetworkPermission?: LocalNetworkPermissionCallback
): ZippRuntime {
  // Detect which calling convention is being used
  if (configOrOnToken && typeof configOrOnToken === 'object' && !('call' in configOrOnToken)) {
    // Configuration object style
    return new ZippRuntime(configOrOnToken as RuntimeConfig);
  }
  // Legacy positional parameters style
  return new ZippRuntime(
    configOrOnToken as StreamCallback,
    onLog,
    onImage,
    onNodeStatus,
    abortSignal,
    onDatabase,
    onLocalNetworkPermission
  );
}

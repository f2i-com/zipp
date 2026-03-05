// Zipp Runtime - Executes FormLogic scripts with agentic capabilities
import init, { WasmFormLogicEngine } from 'formlogic-lang';
import { ZippCompiler } from './compiler.js';
import { extractDeepValue } from './formlogic-types.js';
import { AbortError } from './errors.js';
import type { WorkflowGraph, StreamCallback, LogCallback, ImageCallback, NodeStatusCallback, Flow, DatabaseCallback, WorkflowInputs, LocalNetworkPermissionCallback, ProjectSettings } from './types.js';
import type { RuntimeModule, RuntimeContext, ModuleRegistry, LoadedModule } from './module-types.js';
import { BoundedMap } from './runtime/BoundedMap.js';
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

export interface RuntimeConfig {
  callbacks?: {
    onToken?: StreamCallback;
    onLog?: LogCallback;
    onImage?: ImageCallback;
    onNodeStatus?: NodeStatusCallback;
    onDatabase?: DatabaseCallback;
    onLocalNetworkPermission?: LocalNetworkPermissionCallback;
  };
  abortSignal?: AbortSignal;
  moduleRegistry?: ModuleRegistry;
  flows?: Flow[];
  packageMacros?: Flow[];
  projectSettings?: ProjectSettings;
  moduleSettings?: Record<string, Record<string, unknown>>;
}

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

const AGENT_MEMORY_TABLE = '_agent_memory';

// Global cache for initialized wasm
let wasmInitialized = false;

export class ZippRuntime {
  private onToken: StreamCallback | null = null;
  private onLog: LogCallback | null = null;
  private onImage: ImageCallback | null = null;
  private onNodeStatus: NodeStatusCallback | null = null;
  private onDatabase: DatabaseCallback | null = null;
  private onLocalNetworkPermission: LocalNetworkPermissionCallback | null = null;
  private abortSignal: AbortSignal | null = null;
  private agentMemory: BoundedMap<string, string | number | boolean | object> = new BoundedMap({
    maxEntries: 1000,
    maxValueSize: 1024 * 1024,
  });
  private agentMemoryLoaded: boolean = false;
  private moduleRegistry: ModuleRegistry | null = null;
  private loadedRuntimeModules: Map<string, RuntimeModule> = new Map();
  private moduleSettings: Record<string, Record<string, unknown>> = {};
  private availableFlows: Flow[] = [];
  private packageMacros: Flow[] = [];
  private projectSettings: ProjectSettings = {};

  private currentFlowId: string | null = null;
  private currentPackageId: string | null = null;

  private useClaudeForAI: boolean = false;
  private currentJobId: string | null = null;
  private onYieldForAI: ((request: any) => Promise<string>) | null = null;

  // Store module functions for the host loop
  private moduleFunctionHandlers: Record<string, (...args: any[]) => any> = {};

  constructor(configOrOnToken?: RuntimeConfig | StreamCallback, ...legacyArgs: unknown[]) {
    if (configOrOnToken && typeof configOrOnToken === 'object' && !('call' in configOrOnToken)) {
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
      this.onToken = (configOrOnToken as StreamCallback) || null;
      this.onLog = (legacyArgs[0] as LogCallback) || null;
      this.onImage = (legacyArgs[1] as ImageCallback) || null;
      this.onNodeStatus = (legacyArgs[2] as NodeStatusCallback) || null;
      this.abortSignal = (legacyArgs[3] as AbortSignal) || null;
      this.onDatabase = (legacyArgs[4] as DatabaseCallback) || null;
      this.onLocalNetworkPermission = (legacyArgs[5] as LocalNetworkPermissionCallback) || null;
    }

    this.registerBuiltinModules();
  }

  setProjectSettings(settings: ProjectSettings): void {
    this.projectSettings = settings;
  }

  setFlowContext(flowId: string | null, packageId?: string | null): void {
    this.currentFlowId = flowId;
    this.currentPackageId = packageId || null;
    if (flowId) {
      runtimeLogger.debug(`Flow context set: flowId=${flowId}${packageId ? `, packageId=${packageId}` : ''}`);
    }
  }

  setClaudeAsAI(enabled: boolean, jobId: string | null, yieldCallback: any | null): void {
    this.useClaudeForAI = enabled;
    this.currentJobId = jobId;
    this.onYieldForAI = yieldCallback;
  }

  getFlowContext(): { flowId: string | null; packageId: string | null } {
    return { flowId: this.currentFlowId, packageId: this.currentPackageId };
  }

  addToLocalNetworkWhitelist(hostPort: string): void {
    const currentWhitelist = this.projectSettings.localNetworkWhitelist || [];
    if (!currentWhitelist.includes(hostPort)) {
      this.projectSettings = {
        ...this.projectSettings,
        localNetworkWhitelist: [...currentWhitelist, hostPort],
      };
    }
  }

  private isLocalNetworkUrl(url: string): boolean {
    return isLocalNetworkUrlUtil(url);
  }

  private getHostPort(url: string): string {
    return getHostPortUtil(url);
  }

  private isUrlWhitelisted(url: string): boolean {
    return isUrlWhitelistedUtil(
      url,
      this.projectSettings.localNetworkWhitelist || [],
      this.projectSettings.allowAllLocalNetwork
    );
  }

  private async performHttpRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const isLocalNetwork = this.isLocalNetworkUrl(url);

    if (isLocalNetwork && !this.isUrlWhitelisted(url)) {
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
            try {
              const value = typeof doc.value === 'string' ? JSON.parse(doc.value) : doc.value;
              this.agentMemory.set(doc.key, value as string | number | boolean | object);
            } catch {
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

  private async persistMemoryEntry(key: string, value: unknown): Promise<void> {
    if (!this.onDatabase) return;
    try {
      const serializedValue = JSON.stringify(value);
      await this.onDatabase({
        operation: 'delete',
        storageType: 'collection',
        collectionName: AGENT_MEMORY_TABLE,
        filter: { key },
      });
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

  private async deletePersistedMemoryEntry(key: string): Promise<void> {
    if (!this.onDatabase) return;
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

  private registerModuleInternally(name: string, methods: Record<string, (...args: any[]) => any>) {
    for (const [methodName, fn] of Object.entries(methods)) {
      this.moduleFunctionHandlers[`${name}.${methodName}`] = fn;
    }
  }

  private registerBuiltinModules(): void {
    const abortMod = createAbortModule({ abortSignal: this.abortSignal });
    const utilMod = createUtilityModule({ performHttpRequest: this.performHttpRequest.bind(this) });
    const agentMod = createAgentModule({
      agentMemory: this.agentMemory,
      loadPersistedMemory: this.loadPersistedMemory.bind(this),
      persistMemoryEntry: this.persistMemoryEntry.bind(this),
      deletePersistedMemoryEntry: this.deletePersistedMemoryEntry.bind(this),
      onLog: this.onLog,
    });

    this.registerModuleInternally('Abort', abortMod);
    this.registerModuleInternally('Utility', utilMod);
    this.registerModuleInternally('Agent', agentMod);
  }

  setModuleRegistry(registry: ModuleRegistry): void {
    this.moduleRegistry = registry;
  }

  setModuleSettings(settings: Record<string, Record<string, unknown>>): void {
    this.moduleSettings = settings;
  }

  setAvailableFlows(flows: Flow[]): void {
    this.availableFlows = flows;
  }

  setPackageMacros(macros: Flow[]): void {
    this.packageMacros = macros;
  }

  clearPackageMacros(): void {
    this.packageMacros = [];
  }

  private findFlowOrMacro(flowId: string): Flow | undefined {
    const packageMacro = this.packageMacros.find(f => f.id === flowId);
    if (packageMacro) return packageMacro;
    return this.availableFlows.find(f => f.id === flowId);
  }

  private async executeSubflow(flowId: string, inputs: Record<string, unknown>): Promise<unknown> {
    const flow = this.findFlowOrMacro(flowId);
    if (!flow) {
      throw new Error(`Subflow not found: ${flowId}`);
    }

    const compiler = new ZippCompiler();
    compiler.setAvailableFlows(this.availableFlows);
    if (this.packageMacros.length > 0) {
      compiler.setPackageMacros(this.packageMacros);
    }
    if (this.moduleRegistry) {
      compiler.setModuleRegistry(this.moduleRegistry);
    }
    compiler.setProjectSettings(this.projectSettings);

    const script = compiler.compile(flow.graph, inputs as WorkflowInputs);

    try {
      const result = await this.executeWasmEngine(script);
      return extractDeepValue(result);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      throw new Error(`Subflow execution failed: ${error}`);
    }
  }

  async registerDynamicModule(loadedModule: LoadedModule): Promise<void> {
    const runtimeModule = loadedModule.runtime;
    if (!runtimeModule) return;

    const context: RuntimeContext = {
      log: (level, message) => {
        if (this.onLog) {
          const typeMap: Record<string, 'info' | 'error' | 'success' | 'node'> = {
            info: 'info', warn: 'info', error: 'error', success: 'success',
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
      fetch: (url: string, options?: RequestInit) => {
        const fetchOptions = { ...options };
        if (this.abortSignal && !fetchOptions.signal) {
          fetchOptions.signal = this.abortSignal;
        }
        return fetch(url, fetchOptions);
      },
      secureFetch: async (url: string, options?: RequestInit & { nodeId?: string; purpose?: string }) => {
        return fetch(url, options); // shim
      },
      onStreamToken: this.onToken ? (nodeId, token) => this.onToken?.(nodeId, token) : undefined,
      onImage: this.onImage ? (nodeId, imageUrl) => this.onImage?.(nodeId, imageUrl) : undefined,
      onNodeStatus: this.onNodeStatus ? (nodeId, status) => this.onNodeStatus?.(nodeId, status) : undefined,
      runSubflow: (flowId, inputs) => this.executeSubflow(flowId, inputs),
      useClaudeForAI: this.useClaudeForAI,
      currentJobId: this.currentJobId || undefined,
      yieldForAI: this.onYieldForAI || undefined,
      tauri: typeof window !== 'undefined' && '__TAURI__' in window ? (window as any).__TAURI__?.core : undefined,
    };

    if (!context.tauri && typeof window !== 'undefined' && (window as any).__TAURI_INVOKE__) {
       context.tauri = { invoke: (window as any).__TAURI_INVOKE__ };
    }

    if (runtimeModule.init) {
      await runtimeModule.init(context);
    }

    this.registerModuleInternally(runtimeModule.name, runtimeModule.methods as any);
    this.loadedRuntimeModules.set(loadedModule.manifest.id, runtimeModule);

    if (this.onLog) {
      this.onLog({ source: 'ModuleLoader', message: `Registered dynamic module: ${runtimeModule.name}`, type: 'info' });
    }
  }

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

  private log(type: 'info' | 'error' | 'success', message: string) {
    if (this.onLog) {
      this.onLog({ source: 'System', message, type });
    }
  }

  private getModulesShim(): string {
    let shimCode = `

`;

    const allModules = ['Abort', 'Utility', 'Agent', ...Array.from(this.loadedRuntimeModules.values()).map(m => m.name)];

    for (const modName of new Set(allModules)) {
      shimCode += `let ${modName} = {\n`;
      
      const methods = Object.keys(this.moduleFunctionHandlers).filter(k => k.startsWith(`${modName}.`)).map(k => k.split('.')[1]);
      
      for (const methodName of methods) {
        shimCode += `  "${methodName}"(...args) {\n`;
        shimCode += `    let jsonArgs = JSON.stringify(args);\n`;
        shimCode += `    return { _kind: "${modName}.${methodName}", _args: [jsonArgs] };\n`;
        shimCode += `  },\n`;
      }
      shimCode += `};\n`;
    }
    
    // Add a dummy console object for FormLogic
    shimCode += `\nlet console = {\n`;
    shimCode += `  "log"() {},\n  "warn"() {},\n  "error"() {},\n  "debug"() {}\n`;
    shimCode += `};\n`;

    return shimCode;
  }

  private async executeWasmEngine(script: string): Promise<any> {
    if (!wasmInitialized) {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = await import('fs');
        const path = await import('path');
        let wasmPath = '';
        try {
          // If we are in CommonJS
          wasmPath = require.resolve('formlogic-lang/formlogic_wasm_bg.wasm');
        } catch (e) {
          // If we are in ESM or require.resolve fails
          try {
            const { fileURLToPath } = await import('url');
            const dirname = path.dirname(fileURLToPath(import.meta.url));
            wasmPath = path.resolve(dirname, '../../../formlogic-rust/dist-wasm/formlogic_wasm_bg.wasm');
          } catch (e2) {
            wasmPath = path.resolve(process.cwd(), '../../formlogic-rust/dist-wasm/formlogic_wasm_bg.wasm');
          }
        }
        
        try {
          const wasmBuffer = fs.readFileSync(wasmPath);
          await init(wasmBuffer);
        } catch (err) {
          console.warn('Failed to load WASM via file system, falling back to default init()', err);
          await init();
        }
      } else {
        try {
          await init('/formlogic_wasm_bg.wasm');
        } catch (e) {
          console.warn('Failed to load WASM via /formlogic_wasm_bg.wasm, trying default init()', e);
          await init();
        }
      }
      wasmInitialized = true;
    }

    const engine = new WasmFormLogicEngine();
    
    try {
      const fullScript = `
${this.getModulesShim()}

function* __run_workflow() {
   let __res = null;
   try {
       ${script.replace(/await/g, 'yield')}
       __res = workflow_context;
   } catch (e) {
       host.call("__system.finish_error", [String(e)], function(r){});
       return;
   }
   return __res;
}

let __gen = __run_workflow();
function __step(val) {
   try {
       let item = val === undefined ? __gen.next() : __gen.next(val);
       if (item.done) {
          host.call("__system.finish", [JSON.stringify(item.value)], function(){});
          return;
       }
       if (item.value && item.value._kind) {
          host.call(item.value._kind, item.value._args, function(res) {
             if (res && typeof res === 'object' && res.__error__) {
                 try {
                     __gen.throw(new Error(res.__error__));
                 } catch(e) {
                     host.call("__system.finish_error", [String(e)], function(){});
                 }
             } else {
                 __step(res);
             }
          });
       } else {
          // If it yielded undefined, it might be a yield inside an empty generator.
          // In Formlogic-rust, sometimes we yield directly without value? Just step.
          if (!item.value) {
             __step();
          } else {
             host.call("__system.finish_error", ["Unknown yield: " + JSON.stringify(item.value)], function(){});
          }
       }
   } catch(e) {
       host.call("__system.finish_error", [String(e)], function(){});
   }
}
__step();
`;

      engine.initScript(fullScript);

      return await new Promise((resolve, reject) => {
        let isDone = false;
        const poll = async () => {
          if (isDone) return;
          try {
            if (this.abortSignal?.aborted) {
              isDone = true;
              reject(new AbortError());
              return;
            }

            let calls = engine.drainPendingHostCalls();
            for (const call of calls) {
              // We'll leave out console.log("[POLL] Drain...") to clean up test output
              if (call.kind === "__system.finish") {
                isDone = true;
                const res = call.args[0] ? JSON.parse(call.args[0]) : null;
                resolve(res);
                return;
              }
              if (call.kind === "__system.finish_error") {
                isDone = true;
                reject(new Error(String(call.args[0])));
                return;
              }

              const handler = this.moduleFunctionHandlers[call.kind];
              if (handler) {
                const argsStr = call.args[0];
                const args = argsStr ? JSON.parse(argsStr) : [];
                
                Promise.resolve(handler(...args)).then(res => {
                  engine.resolveHostCallback(call.id, res);
                }).catch(err => {
                  engine.resolveHostCallback(call.id, { __error__: String(err) });
                });
              } else {
                engine.resolveHostCallback(call.id, { error: `Unknown method ${call.kind}` });
              }
            }

            if (!isDone) {
              setTimeout(poll, 10);
            }
          } catch (e) {
            isDone = true;
            reject(e);
          }
        };

        poll();
      });
    } finally {
      if (typeof engine.free === 'function') {
        engine.free();
      }
    }
  }

  async runWorkflow(graph: WorkflowGraph, availableFlows?: Flow[], inputs?: WorkflowInputs): Promise<any> {
    if (availableFlows) {
      this.availableFlows = availableFlows;
    }

    const compiler = new ZippCompiler();
    if (availableFlows) compiler.setAvailableFlows(availableFlows);
    if (this.packageMacros.length > 0) compiler.setPackageMacros(this.packageMacros);
    if (this.moduleRegistry) compiler.setModuleRegistry(this.moduleRegistry);
    compiler.setProjectSettings(this.projectSettings);

    const script = compiler.compile(graph, inputs);

    this.log('info', '--- Starting Workflow Execution ---');

    try {
      const result = await this.executeWasmEngine(script);
      this.log('success', '--- Workflow Completed Successfully ---');
      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      const isAbort = error.includes('__ABORT__') || error.includes('aborted');
      if (!isAbort) {
        this.log('error', `Workflow Error: ${error}`);
      }
      throw e;
    }
  }

  clearMemory() {
    this.agentMemory.clear();
    this.log('info', '[Memory] Cleared');
  }

  getMemorySnapshot(): Record<string, string | number | boolean | object> {
    return Object.fromEntries(this.agentMemory);
  }

  convertResultToJs(result: unknown): unknown {
    return extractDeepValue(result);
  }
}

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
  if (configOrOnToken && typeof configOrOnToken === 'object' && !('call' in configOrOnToken)) {
    return new ZippRuntime(configOrOnToken as RuntimeConfig);
  }
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

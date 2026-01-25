/**
 * Zipp Module System Types
 *
 * Type definitions for the modular node system.
 */

// ============================================
// Module Manifest Types
// ============================================

export type ModuleCategory =
  | 'Input'
  | 'Output'
  | 'AI'
  | 'Image'
  | 'Video'
  | 'Audio'
  | 'Text'
  | 'File System'
  | 'Flow Control'
  | 'Browser'
  | 'Terminal'
  | 'Database'
  | 'Network'
  | 'Utility'
  | 'Macros'
  | 'Custom';

export type ModulePermission =
  | 'filesystem'
  | 'network'
  | 'shell'
  | 'clipboard'
  | 'notifications';

export interface ModuleSettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  label: string;
  description?: string;
  default?: unknown;
  options?: Array<{ value: unknown; label: string }>;
}

export interface ModuleNativeConfig {
  /** Tauri plugin name (e.g., "zipp-browser") */
  plugin: string;
  /** Path to main Rust source file (relative to module root) */
  source?: string;
  /** Path to Cargo.toml (relative to module root) */
  cargo?: string;
}

export interface ModuleRuntimeConfig {
  /** Path to TypeScript runtime file (relative to module root) */
  typescript?: string;
  /** Path to compiler TypeScript file (relative to module root) */
  compiler?: string;
  /** Native Rust/Tauri plugin configuration */
  native?: string | ModuleNativeConfig;
  /** NPM dependencies required by this module */
  dependencies?: string[];
}

export interface NodeUIMapping {
  /** Node type ID */
  nodeType: string;
  /** UI component name (e.g., "AILLMNode") */
  componentName: string;
  /** Optional: path to component file relative to module root */
  componentPath?: string;
}

export interface ModuleUIConfig {
  /** Mapping of node types to UI component names */
  nodes?: NodeUIMapping[];
  /** Path to UI components directory (relative to module root) */
  componentsDir?: string;
}

export interface ModuleBinaryConfig {
  /** Path to Windows binary */
  windows?: string;
  /** Path to macOS binary */
  macos?: string;
  /** Path to Linux binary */
  linux?: string;
  /** URL template for downloading binary ({platform} will be replaced) */
  download?: string;
  /** Expected version or checksum for validation */
  version?: string;
}

/**
 * Module manifest defines the metadata and capabilities of a Zipp module.
 *
 * @example
 * ```typescript
 * const manifest: ModuleManifest = {
 *   id: 'my-module',
 *   name: 'My Module',
 *   version: '1.0.0',
 *   category: 'Utility',
 *   nodes: ['my_node_a', 'my_node_b'],
 *   dependencies: ['core-ai'],  // Required modules
 *   optionalDependencies: ['plugin-vectorize'],  // Optional enhancements
 * };
 * ```
 */
export interface ModuleManifest {
  /** Unique module identifier (lowercase, hyphens allowed, e.g., 'core-ai') */
  id: string;
  /** Human-readable module name */
  name: string;
  /** Semantic version string (e.g., '1.0.0', '2.1.0-beta.1') */
  version: string;
  /** Module description */
  description?: string;
  /** Module author name or organization */
  author?: string;
  /** Category for UI grouping */
  category?: ModuleCategory;
  /** Icon identifier or path */
  icon?: string;
  /** Theme color (hex or named) */
  color?: string;
  /**
   * Required module dependencies.
   * These modules must be loaded before this module can function.
   * The module loader will ensure dependencies are loaded first.
   * @example ['core-ai', 'core-filesystem']
   */
  dependencies?: string[];
  /**
   * Optional module dependencies.
   * If present, enables additional features but module works without them.
   * @example ['plugin-vectorize']
   */
  optionalDependencies?: string[];
  /**
   * Peer dependencies (version compatibility constraints).
   * Specifies version ranges of modules this is compatible with.
   * @example { 'core-ai': '>=2.0.0' }
   */
  peerDependencies?: Record<string, string>;
  /** Node type IDs provided by this module */
  nodes: string[];
  /** Module-specific settings definitions */
  settings?: Record<string, ModuleSettingDefinition>;
  /** System permissions required by this module */
  permissions?: ModulePermission[];
  /** Source repository URL */
  repository?: string;
  /** Documentation homepage URL */
  homepage?: string;
  /** Runtime configuration */
  runtime?: ModuleRuntimeConfig;
  /** External binary dependencies */
  binaries?: Record<string, ModuleBinaryConfig>;
  /** UI component configuration */
  ui?: ModuleUIConfig;
}

// ============================================
// Node Definition Types
// ============================================

export type HandleDataType =
  | 'any'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'image'
  | 'file'
  | 'json';

export type HandlePosition = 'left' | 'right' | 'top' | 'bottom';

export interface HandleDefinition {
  id: string;
  name: string;
  type: HandleDataType;
  required?: boolean;
  multiple?: boolean;
  position?: HandlePosition;
  color?: string;
  description?: string;
  /**
   * Variable suffix for compiler output. Used to map output handles to variable names.
   * - If defined, the output variable will be `node_{id}_out{varSuffix}` (e.g., varSuffix="_session" => `node_xxx_out_session`)
   * - If not defined, defaults to empty string for single-output nodes or `_{handleId}` for multi-output nodes
   * - Special case: varSuffix="" means use just `node_{id}_out` with no suffix
   */
  varSuffix?: string;
}

export type PropertyType =
  | 'string'
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'secret'
  | 'color'
  | 'file'
  | 'code'
  | 'json'
  | 'array'
  | 'keyvalue';

export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'sql'
  | 'markdown'
  | 'formlogic';

export interface PropertyCondition {
  property: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
}

export interface PropertyOption {
  value: unknown;
  label: string;
  description?: string;
}

export interface PropertyDefinition {
  id: string;
  name: string;
  type: PropertyType;
  default?: unknown;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  showIf?: PropertyCondition;
  // Number specific
  min?: number;
  max?: number;
  step?: number;
  // Select specific
  options?: PropertyOption[];
  // Code specific
  language?: CodeLanguage;
  // Textarea specific
  rows?: number;
  // File specific
  accept?: string;
  // Organization
  group?: string;
  advanced?: boolean;
}

export interface CompilerConfig {
  template?: string;
  preCode?: string;
  postCode?: string;
  async?: boolean;
  abortable?: boolean;
  statusTracking?: boolean;
  outputVariable?: string;
  customHandler?: string | boolean;
  /** Map of output handle ID to variable name template for additional outputs */
  additionalOutputs?: Record<string, string>;
}

export interface UIConfig {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  collapsible?: boolean;
  previewField?: string;
  showPreview?: boolean;
  customComponent?: string;
}

export interface RuntimeConfig {
  streaming?: boolean;
  cacheable?: boolean;
  retryable?: boolean;
  maxRetries?: number;
}

/**
 * FlowPlan configuration for mapping FlowPlan DSL to this node type.
 * Allows the AI flow designer to use this node for specific step types.
 */
export interface FlowplanConfig {
  /** FlowPlan step types that should use this node (e.g., ["ai_image", "image_gen"]) */
  stepTypes?: string[];

  /** Mapping from FlowPlan step field names to node property IDs */
  fieldMapping?: Record<string, string>;

  /**
   * Value transformations for specific fields.
   * Maps step field values to node property values.
   * Example: { "as": { "text": "utf8", "base64": "base64" } }
   */
  valueMapping?: Record<string, Record<string, unknown>>;

  /**
   * Default property values when creating from FlowPlan.
   * These override node defaults and are applied before field mapping.
   */
  defaults?: Record<string, unknown>;

  /**
   * Fields that should create an auxiliary input_text node when they contain literal values.
   * The auxiliary node will be connected to the specified input handle.
   * Example: ["prompt"] - creates an input_text node for literal prompt strings
   */
  literalInputFields?: string[];

  /**
   * Options to apply from compiler options.
   * Maps compiler option names to node property IDs.
   * Example: { "aiModel": "model", "aiEndpoint": "endpoint" }
   */
  compilerOptionsMapping?: Record<string, string>;

  /**
   * Conditional property values based on step field presence/values.
   * Example: { "imageFormat": { "when": "image", "then": "base64", "else": "none" } }
   */
  conditionalDefaults?: Record<string, { when: string; then: unknown; else: unknown }>;

  /**
   * Fields on the step that can contain template references (for edge wiring).
   * These fields are scanned for {{references}} to create edges.
   * Example: ["prompt", "image", "path"]
   */
  templateFields?: string[];

  /**
   * Maps step fields to input handles for edge wiring.
   * Used to determine which input handle to connect when a reference appears in a field.
   * Example: { "image": "image", "url": "url" }
   * Fields not listed use the primary input handle.
   */
  inputHandleMapping?: Record<string, string>;
}

export interface NodeDefinition {
  id: string;
  name: string;
  description?: string;
  /**
   * Detailed documentation for the node.
   * Shown in popover when hovering over the node in the palette.
   * Supports markdown formatting.
   */
  doc?: string;
  icon?: string;
  color?: string;
  tags?: string[];
  /** Version of the node definition (for compatibility tracking) */
  version?: string;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  properties?: PropertyDefinition[];
  compiler: CompilerConfig;
  ui?: UIConfig;
  runtime?: RuntimeConfig;
  /** FlowPlan DSL mapping configuration */
  flowplan?: FlowplanConfig;
}

// ============================================
// Runtime Module Types
// ============================================

export interface RuntimeContext {
  log: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void;
  settings: Record<string, unknown>;
  getModuleSetting: (key: string) => unknown;
  tauri?: {
    invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
  abortSignal?: AbortSignal;

  // Streaming callbacks for real-time updates
  onStreamToken?: (nodeId: string, token: string) => void;
  onImage?: (nodeId: string, imageUrl: string) => void;
  onNodeStatus?: (nodeId: string, status: 'running' | 'completed' | 'error') => void;

  // HTTP fetch with abort support
  fetch: (url: string, options?: RequestInit) => Promise<Response>;

  // Secure HTTP fetch that respects SSRF protection (uses Tauri HTTP client when available)
  // Local network access is controlled by project settings whitelist
  // If URL is not whitelisted, will prompt user for permission (if callback is set)
  secureFetch: (url: string, options?: RequestInit & { nodeId?: string; purpose?: string }) => Promise<Response>;

  // Get project constants (API keys, etc.)
  getConstant?: (name: string) => string | undefined;

  // Subflow execution callback
  runSubflow?: (flowId: string, inputs: Record<string, unknown>) => Promise<unknown>;

  // Database interface for workflow data storage
  database?: {
    insertDocument: (collection: string, data: Record<string, unknown>, id?: string) => Promise<string>;
    findDocuments: (collection: string, filter?: Record<string, unknown>) => Promise<{ id: string; data: Record<string, unknown>; created_at: string }[]>;
    updateDocument: (id: string, data: Record<string, unknown>) => Promise<boolean>;
    deleteDocument: (id: string) => Promise<boolean>;
  };

  // Claude-as-AI pattern: yield at AI nodes for external response
  /** Whether to yield at AI nodes instead of calling the AI API */
  useClaudeForAI?: boolean;
  /** Current job ID (needed for AI yield) */
  currentJobId?: string;
  /** Callback to yield at an AI node and wait for external response */
  yieldForAI?: (request: {
    nodeId: string;
    systemPrompt: string;
    userPrompt: string;
    images?: string[];
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) => Promise<string>;
}

// RuntimeMethod uses 'any' because module methods can have arbitrary signatures
// and the runtime needs to support dynamic invocation of methods with varying parameters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RuntimeMethod = (...args: any[]) => any;

export interface RuntimeModule {
  name: string;
  init?: (context: RuntimeContext) => Promise<void>;
  methods: Record<string, RuntimeMethod>;
  streaming?: Record<string, boolean>;
  cleanup?: () => Promise<void>;
}

// ============================================
// Loaded Module Types
// ============================================

// ============================================
// Module Compiler Types
// ============================================

export interface ModuleCompilerContext {
  /** The node instance being compiled */
  node: NodeInstance;
  /** The node definition from the module */
  definition: NodeDefinition;
  /** Map of input handle ID to the source variable name */
  inputs: Map<string, string>;
  /** The output variable name for this node */
  outputVar: string;
  /** The sanitized node ID (safe for variable names) */
  sanitizedId: string;
  /** Whether this node is inside a loop */
  isInLoop: boolean;
  /** If inside a loop, the loop_start node ID */
  loopStartId?: string;
  /** Whether to skip 'let' declaration (variable is pre-declared) */
  skipVarDeclaration: boolean;
  /** Helper to escape strings for code generation */
  escapeString: (str: string) => string;
  /** Helper to sanitize IDs for variable names */
  sanitizeId: (id: string) => string;
  /** Whether debug output is enabled (for conditional debug logs in generated code) */
  debugEnabled?: boolean;
}

export interface ModuleCompiler {
  /** Module name for logging */
  name: string;

  /**
   * Compile a node into FormLogic code.
   * Return the generated code string, or null to use default template compilation.
   */
  compileNode: (nodeType: string, ctx: ModuleCompilerContext) => string | null;

  /**
   * Optional: Get the list of node types this compiler handles.
   * If not provided, the compiler will be called for all nodes in the module.
   */
  getNodeTypes?: () => string[];
}

export interface LoadedModule {
  manifest: ModuleManifest;
  nodes: Map<string, NodeDefinition>;
  runtime?: RuntimeModule;
  compiler?: ModuleCompiler;
  path: string;
  enabled: boolean;
}

export interface ModuleLoadError {
  moduleId: string;
  modulePath: string;
  error: string;
  details?: unknown;
}

export interface ModuleLoadResult {
  success: boolean;
  module?: LoadedModule;
  error?: ModuleLoadError;
}

// ============================================
// Module Registry Types
// ============================================

export interface ModuleRegistry {
  modules: Map<string, LoadedModule>;
  nodeDefinitions: Map<string, NodeDefinition>;
  nodeToModule: Map<string, string>;

  getModule(moduleId: string): LoadedModule | undefined;
  getNodeDefinition(nodeType: string): NodeDefinition | undefined;
  getAllNodeDefinitions(): NodeDefinition[];
  getModuleForNode(nodeType: string): LoadedModule | undefined;
  getNodesByCategory(category: ModuleCategory): NodeDefinition[];
  isNodeTypeValid(nodeType: string): boolean;
}

// ============================================
// Module Settings Types
// ============================================

export interface ModuleSettings {
  modulesDirectory: string;
  enabledModules: string[];
  moduleSettings: Record<string, Record<string, unknown>>;
}

// ============================================
// Node Instance Types (for workflow)
// ============================================

export interface NodeInstance {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

// ============================================
// Compiler Context Types
// ============================================

export interface CompilerContext {
  node: NodeInstance;
  definition: NodeDefinition;
  inputs: Map<string, string>; // input handle id -> variable name
  outputVar: string;
  nodeId: string;
  sanitizedId: string;
  isInLoop: boolean;
  loopStartId?: string;
}

// ============================================
// Validation Types
// ============================================

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ============================================
// Event Types
// ============================================

export type ModuleEventType =
  | 'module:loaded'
  | 'module:unloaded'
  | 'module:error'
  | 'module:enabled'
  | 'module:disabled'
  | 'node:registered'
  | 'node:unregistered';

export interface ModuleEvent {
  type: ModuleEventType;
  moduleId?: string;
  nodeId?: string;
  data?: unknown;
}

export type ModuleEventHandler = (event: ModuleEvent) => void;

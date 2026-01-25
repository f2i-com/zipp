/**
 * Custom Node Registry
 *
 * Manages compiled custom nodes from .zipp packages.
 * Provides access to compiler, runtime, and UI components.
 * Integrates with ModuleLoader for flow compilation support.
 */

import type { EmbeddedCustomNode, NodeDefinition, ModuleCompiler, ModuleCompilerContext, ModuleManifest, ModuleCategory, PropertyType } from 'zipp-core';
import { getModuleLoader } from 'zipp-core';
import type React from 'react';
import { compileCustomNode, type CustomNodeCompileResult } from './customNodeCompiler';
import { createLogger } from '../utils/logger';

const logger = createLogger('CustomNodeRegistry');

// ============================================
// Types
// ============================================

export interface CustomNodeCompilerContext {
  node: { id: string; type: string; data: Record<string, unknown> };
  inputs: Map<string, string>;
  outputVar: string;
  sanitizedId: string;
  escapeString: (str: string) => string;
  skipVarDeclaration?: boolean;
}

export type CustomNodeCompilerFunction = (ctx: CustomNodeCompilerContext) => string;

export interface CustomNodeRuntimeContext {
  log: (level: string, message: string) => void;
  getInput: (id: string) => unknown;
  setOutput: (id: string, value: unknown) => void;
  nodeId: string;
  nodeData: Record<string, unknown>;
}

export type CustomNodeRuntimeFunction = (
  inputs: Record<string, unknown>,
  ctx: CustomNodeRuntimeContext
) => Promise<unknown> | unknown;

export interface RegisteredCustomNode {
  definition: EmbeddedCustomNode;
  nodeDefinition: NodeDefinition;
  packageId: string;
  compiled: {
    compiler: string;
    runtime: string;
    ui?: string;
  };
  compilerFn?: CustomNodeCompilerFunction;
  runtimeFn?: CustomNodeRuntimeFunction;
  uiComponent?: React.ComponentType<unknown>;
}

// ============================================
// Registry State
// ============================================

// Map from full node type (pkg:{packageId}:{nodeId}) to registered node
const registeredNodes = new Map<string, RegisteredCustomNode>();

// Map from package ID to list of node types
const packageNodes = new Map<string, string[]>();

// Version counter for cache invalidation
let registryVersion = 0;

// ============================================
// Helper Functions
// ============================================

/**
 * Get the full node type for a custom node
 */
export function getFullNodeType(packageId: string, nodeId: string): string {
  return `pkg:${packageId}:${nodeId}`;
}

/**
 * Parse a full node type to get package ID and node ID
 */
export function parseFullNodeType(fullNodeType: string): { packageId: string; nodeId: string } | null {
  const match = fullNodeType.match(/^pkg:([^:]+):(.+)$/);
  if (!match) return null;
  return { packageId: match[1], nodeId: match[2] };
}

/**
 * Convert EmbeddedCustomNode to NodeDefinition
 */
function createNodeDefinition(node: EmbeddedCustomNode, packageId: string): NodeDefinition {
  // Convert embedded node properties to NodeDefinition properties
  const properties = (node.properties || []).map(prop => ({
    id: prop.id,
    name: prop.name,
    type: prop.type as PropertyType,
    default: prop.default,
    options: prop.options,
    min: prop.min,
    max: prop.max,
    step: prop.step,
    advanced: prop.advanced,
    group: prop.group,
  }));

  return {
    id: getFullNodeType(packageId, node.id),
    name: node.name,
    description: node.description,
    icon: node.icon,
    inputs: node.inputs.map(input => ({
      id: input.id,
      name: input.name,
      type: input.type as 'string' | 'number' | 'boolean' | 'any',
      required: input.required ?? false,
      position: 'left' as const,
    })),
    outputs: node.outputs.map(output => ({
      id: output.id,
      name: output.name,
      type: output.type as 'string' | 'number' | 'boolean' | 'any',
      position: 'right' as const,
    })),
    properties,
    // Custom nodes use a custom handler for compilation
    compiler: {
      customHandler: true,
    },
  };
}

/**
 * Load and execute compiled JavaScript code to extract exports
 */
function loadCompiledCode<T>(
  code: string,
  globalName: string,
  exportName: string
): T | undefined {
  try {
    // Create a new Function to execute the IIFE
    // The IIFE assigns to a global variable, so we need to extract it
    const fn = new Function(`
      ${code}
      return typeof ${globalName} !== 'undefined' ? ${globalName} : undefined;
    `);

    const exports = fn();

    if (exports && typeof exports === 'object') {
      // Handle various export patterns
      if (exportName in exports) {
        return exports[exportName] as T;
      }
      // Try default export
      if ('default' in exports) {
        const defaultExport = exports.default;
        if (typeof defaultExport === 'object' && exportName in defaultExport) {
          return defaultExport[exportName] as T;
        }
        return defaultExport as T;
      }
    }

    return undefined;
  } catch (error) {
    logger.error('Failed to load compiled code', { error });
    return undefined;
  }
}

// ============================================
// Registry Functions
// ============================================

/**
 * Register a compiled custom node
 */
export async function registerCustomNode(
  packageId: string,
  node: EmbeddedCustomNode,
  compiled: { compiler: string; runtime: string; ui?: string }
): Promise<boolean> {
  const fullType = getFullNodeType(packageId, node.id);

  try {
    // Create node definition
    const nodeDefinition = createNodeDefinition(node, packageId);

    // Create registered node entry
    const registered: RegisteredCustomNode = {
      definition: node,
      nodeDefinition,
      packageId,
      compiled,
    };

    // Try to load compiler function
    const compilerGlobalName = `__CUSTOM_NODE_COMPILER_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}__`;
    const compilerFn = loadCompiledCode<CustomNodeCompilerFunction>(
      compiled.compiler,
      compilerGlobalName,
      'compile'
    );
    if (compilerFn) {
      registered.compilerFn = compilerFn;
      logger.debug(`Loaded compiler for ${fullType}`);
    }

    // Try to load runtime function
    const runtimeGlobalName = `__CUSTOM_NODE_RUNTIME_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}__`;
    const runtimeFn = loadCompiledCode<CustomNodeRuntimeFunction>(
      compiled.runtime,
      runtimeGlobalName,
      'execute'
    );
    if (runtimeFn) {
      registered.runtimeFn = runtimeFn;
      logger.debug(`Loaded runtime for ${fullType}`);
    }

    // UI component loading is handled separately by the UI layer

    // Register the node
    registeredNodes.set(fullType, registered);

    // Track by package
    const pkgNodes = packageNodes.get(packageId) || [];
    if (!pkgNodes.includes(fullType)) {
      pkgNodes.push(fullType);
      packageNodes.set(packageId, pkgNodes);
    }

    // Register with ModuleLoader for flow compilation support
    try {
      const moduleLoader = getModuleLoader();

      // Create a module compiler that wraps the custom node's compile function
      const moduleCompiler: ModuleCompiler = {
        name: `CustomNode:${fullType}`,
        getNodeTypes: () => [fullType],
        compileNode: (nodeType: string, ctx: ModuleCompilerContext): string | null => {
          if (nodeType !== fullType) return null;
          if (!registered.compilerFn) {
            // Fallback: generate a simple pass-through if no compiler
            const inputVar = ctx.inputs.get('input') || ctx.inputs.values().next().value || 'null';
            return `
  // --- Custom Node: ${ctx.node.id} (${nodeType}) ---
  let ${ctx.outputVar} = ${inputVar};
  workflow_context["${ctx.node.id}"] = ${ctx.outputVar};`;
          }

          // Call the custom node's compile function
          const customCtx: CustomNodeCompilerContext = {
            node: ctx.node,
            inputs: ctx.inputs,
            outputVar: ctx.outputVar,
            sanitizedId: ctx.sanitizedId,
            escapeString: ctx.escapeString,
            skipVarDeclaration: ctx.skipVarDeclaration,
          };

          return registered.compilerFn(customCtx);
        },
      };

      // Create a module manifest for this custom node
      const moduleManifest: ModuleManifest = {
        id: `custom-node-${packageId}-${node.id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name: node.name,
        version: '1.0.0',
        description: node.description || `Custom node: ${node.name}`,
        category: (node.category as ModuleCategory) || 'Custom',
        author: 'Package',
        nodes: [fullType],
      };

      // Load the module with the custom compiler
      const result = await moduleLoader.loadModule(
        moduleManifest,
        [nodeDefinition],
        undefined, // No runtime module (handled separately)
        `custom-node:${packageId}/${node.id}`,
        moduleCompiler
      );
      if (result.success) {
        logger.debug(`Registered with ModuleLoader: ${fullType}`);
      } else {
        logger.warn(`ModuleLoader registration failed`, { error: result.error });
      }
    } catch (error) {
      logger.warn('Failed to register with ModuleLoader', { error });
    }

    registryVersion++;
    logger.debug(`Registered custom node: ${fullType}`);

    return true;
  } catch (error) {
    logger.error(`Failed to register ${fullType}`, { error });
    return false;
  }
}

/**
 * Compile and register a custom node
 */
export async function compileAndRegisterCustomNode(
  packageId: string,
  node: EmbeddedCustomNode
): Promise<CustomNodeCompileResult> {
  // Check if already compiled
  if (node.compiled) {
    const success = await registerCustomNode(packageId, node, node.compiled);
    return {
      success,
      nodeId: node.id,
      compiled: node.compiled,
      error: success ? undefined : 'Failed to register pre-compiled node',
    };
  }

  // Compile the node
  const result = await compileCustomNode(node);

  if (result.success && result.compiled) {
    // Update the node with compiled code
    node.compiled = result.compiled;

    // Register the compiled node
    const success = await registerCustomNode(packageId, node, result.compiled);
    if (!success) {
      return {
        success: false,
        nodeId: node.id,
        error: 'Compiled but failed to register',
      };
    }
  }

  return result;
}

/**
 * Unregister all nodes for a package
 */
export function unregisterPackageNodes(packageId: string): void {
  const nodeTypes = packageNodes.get(packageId) || [];

  for (const nodeType of nodeTypes) {
    registeredNodes.delete(nodeType);
    logger.debug(`Unregistered: ${nodeType}`);
  }

  packageNodes.delete(packageId);
  registryVersion++;
}

/**
 * Get a registered custom node
 */
export function getCustomNode(fullNodeType: string): RegisteredCustomNode | undefined {
  return registeredNodes.get(fullNodeType);
}

/**
 * Get the node definition for a custom node
 */
export function getCustomNodeDefinition(fullNodeType: string): NodeDefinition | undefined {
  return registeredNodes.get(fullNodeType)?.nodeDefinition;
}

/**
 * Get the compiler function for a custom node
 */
export function getCustomNodeCompiler(fullNodeType: string): CustomNodeCompilerFunction | undefined {
  return registeredNodes.get(fullNodeType)?.compilerFn;
}

/**
 * Get the runtime function for a custom node
 */
export function getCustomNodeRuntime(fullNodeType: string): CustomNodeRuntimeFunction | undefined {
  return registeredNodes.get(fullNodeType)?.runtimeFn;
}

/**
 * Get all registered custom node types
 */
export function getRegisteredCustomNodeTypes(): string[] {
  return Array.from(registeredNodes.keys());
}

/**
 * Get all custom node definitions
 */
export function getAllCustomNodeDefinitions(): NodeDefinition[] {
  return Array.from(registeredNodes.values()).map(n => n.nodeDefinition);
}

/**
 * Get custom nodes for a package
 */
export function getPackageCustomNodes(packageId: string): RegisteredCustomNode[] {
  const nodeTypes = packageNodes.get(packageId) || [];
  return nodeTypes.map(t => registeredNodes.get(t)!).filter(Boolean);
}

/**
 * Check if a node type is a custom node
 */
export function isCustomNode(nodeType: string): boolean {
  return registeredNodes.has(nodeType);
}

/**
 * Get current registry version (for cache invalidation)
 */
export function getCustomNodeRegistryVersion(): number {
  return registryVersion;
}

/**
 * Clear all registered nodes (for testing)
 */
export function clearCustomNodeRegistry(): void {
  registeredNodes.clear();
  packageNodes.clear();
  registryVersion++;
}

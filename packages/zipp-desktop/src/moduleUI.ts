/**
 * Dynamic Module UI Component Loader
 *
 * This file dynamically discovers and loads UI components from all modules.
 * No hardcoded imports - everything is discovered via import.meta.glob.
 */

import { registerNodeComponent, registerComponentByName, GenericNode, GroupNode } from 'zipp-ui-components';
import { BUNDLED_MODULES } from 'zipp-core';

// ============================================
// Dynamic UI Component Discovery
// ============================================

// Dynamically import all UI component index files from modules
// This uses eager loading so components are available immediately
const uiModules = import.meta.glob<Record<string, React.ComponentType<unknown>>>(
  '../../zipp-core/modules/*/ui/index.ts',
  { eager: true }
);


/**
 * Extract module ID from a file path
 * e.g., '../../zipp-core/modules/core-input/ui/index.ts' -> 'core-input'
 */
function getModuleIdFromPath(path: string): string {
  const match = path.match(/\/modules\/([^/]+)\/ui\//);
  return match ? match[1] : '';
}

/**
 * Check if a value is a valid React component (function, memo, forwardRef, etc.)
 */
function isReactComponent(value: unknown): value is React.ComponentType<unknown> {
  if (typeof value === 'function') {
    return true;
  }
  // React.memo, React.forwardRef, React.lazy return objects with $$typeof
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Check for React component markers
    if (obj.$$typeof || obj.render || obj.type) {
      return true;
    }
  }
  return false;
}

/**
 * Build component map from dynamically discovered UI modules
 */
function buildComponentMap(): Record<string, React.ComponentType<unknown>> {
  const componentMap: Record<string, React.ComponentType<unknown>> = {};

  for (const [path, moduleExports] of Object.entries(uiModules)) {
    const moduleId = getModuleIdFromPath(path);

    if (moduleId && moduleExports) {
      // Each UI module exports components by name (e.g., InputTextNode, AILLMNode)
      for (const [exportName, component] of Object.entries(moduleExports)) {
        if (exportName !== 'default' && isReactComponent(component)) {
          componentMap[exportName] = component as React.ComponentType<unknown>;
        }
      }
    }
  }

  return componentMap;
}

// Build the component map at module load time
const componentMap = buildComponentMap();

/**
 * Register all module UI components with the node registry
 */
export function registerModuleUIComponents(): void {
  // Register built-in special node types (not part of modules)
  registerNodeComponent('group', GroupNode);

  // First, register all components by name
  for (const [name, component] of Object.entries(componentMap)) {
    registerComponentByName(name, component);
  }

  // Then, register node types based on module manifests
  // For nodes without custom components, use GenericNode
  for (const module of BUNDLED_MODULES) {
    // Register nodes with custom components
    if (module.manifest.ui?.nodes) {
      for (const mapping of module.manifest.ui.nodes) {
        const component = componentMap[mapping.componentName];
        if (component) {
          registerNodeComponent(mapping.nodeType, component);
        }
      }
    }

    // Register ALL nodes from the module - use GenericNode for those without custom component
    for (const node of module.nodes) {
      // Skip if already registered with custom component
      const hasCustomComponent = module.manifest.ui?.nodes?.some(
        m => m.nodeType === node.id
      );
      if (!hasCustomComponent) {
        registerNodeComponent(node.id, GenericNode);
      }
    }
  }
}

// NOTE: Do NOT auto-register here! Registration must happen AFTER dynamicModules.ts
// populates BUNDLED_MODULES. The registration is called from dynamicModules.ts.

// Export the component map for external use if needed
export { componentMap };

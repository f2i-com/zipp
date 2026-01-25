/**
 * Custom Node UI Loader
 *
 * Dynamically loads and renders UI components for custom nodes.
 * Uses compiled JavaScript from the custom node compiler.
 */

import React from 'react';
import { getCustomNode } from './customNodeRegistry';
import { createLogger } from '../utils/logger';

const logger = createLogger('CustomNodeUILoader');

// Cache of loaded UI components
const loadedComponents = new Map<string, React.ComponentType<unknown>>();

// Version counter for cache invalidation
let loaderVersion = 0;

/**
 * Props passed to custom node UI components
 */
export interface CustomNodeUIProps {
  id: string;
  data: Record<string, unknown>;
  selected?: boolean;
  // Standard callbacks for node UI
  onDataChange?: (updates: Record<string, unknown>) => void;
}

/**
 * Load a UI component from compiled JavaScript code
 */
function loadUIComponent(
  compiledCode: string,
  nodeId: string
): React.ComponentType<unknown> | null {
  try {
    // The compiled code is an IIFE that sets a global variable
    const globalName = `__CUSTOM_NODE_UI_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}__`;

    // Execute the compiled code
    const fn = new Function(`
      ${compiledCode}
      return typeof ${globalName} !== 'undefined' ? ${globalName} : undefined;
    `);

    const exports = fn();

    if (!exports) {
      logger.error(`No exports found for ${nodeId}`);
      return null;
    }

    // Look for the component in various export formats
    let Component: React.ComponentType<unknown> | null = null;

    // Check for default export
    if (exports.default && typeof exports.default === 'function') {
      Component = exports.default;
    }
    // Check for named export matching node ID
    else if (exports[nodeId] && typeof exports[nodeId] === 'function') {
      Component = exports[nodeId];
    }
    // Check for any function export
    else {
      for (const key of Object.keys(exports)) {
        if (typeof exports[key] === 'function') {
          Component = exports[key];
          break;
        }
      }
    }

    if (!Component) {
      logger.error(`No component found in exports for ${nodeId}`);
      return null;
    }

    logger.debug(`Loaded UI component for ${nodeId}`);
    return Component;
  } catch (error) {
    logger.error(`Failed to load UI for ${nodeId}`, { error });
    return null;
  }
}

/**
 * Get the UI component for a custom node
 * Returns null if no custom UI is defined or if loading fails
 */
export function getCustomNodeUIComponent(
  fullNodeType: string
): React.ComponentType<unknown> | null {
  // Check cache first
  const cached = loadedComponents.get(fullNodeType);
  if (cached) return cached;

  // Get the registered node
  const registered = getCustomNode(fullNodeType);
  if (!registered) return null;

  // Check if there's compiled UI code
  if (!registered.compiled?.ui) return null;

  // Load the component
  const Component = loadUIComponent(registered.compiled.ui, registered.definition.id);

  if (Component) {
    loadedComponents.set(fullNodeType, Component);
    loaderVersion++;
  }

  return Component;
}

/**
 * Check if a custom node has a custom UI component
 */
export function hasCustomNodeUI(fullNodeType: string): boolean {
  const registered = getCustomNode(fullNodeType);
  return !!(registered?.compiled?.ui);
}

/**
 * Clear cached UI component for a node (useful when reloading)
 */
export function clearCachedUI(fullNodeType: string): void {
  loadedComponents.delete(fullNodeType);
  loaderVersion++;
}

/**
 * Clear all cached UI components
 */
export function clearAllCachedUI(): void {
  loadedComponents.clear();
  loaderVersion++;
}

/**
 * Get the loader version (for cache invalidation in React)
 */
export function getUILoaderVersion(): number {
  return loaderVersion;
}

/**
 * Create a wrapper component that renders the custom UI
 * This is used by the node registry to create a proper React component
 */
export function createCustomNodeUIWrapper(
  fullNodeType: string
): React.ComponentType<CustomNodeUIProps> | null {
  const CustomUI = getCustomNodeUIComponent(fullNodeType);

  if (!CustomUI) return null;

  // Create a wrapper component
  const Wrapper: React.FC<CustomNodeUIProps> = (props) => {
    // Cast CustomUI to accept CustomNodeUIProps
    const Component = CustomUI as React.ComponentType<CustomNodeUIProps>;
    return React.createElement(Component, props);
  };

  Wrapper.displayName = `CustomNodeUI(${fullNodeType})`;

  return Wrapper;
}

/**
 * Pre-load UI components for all custom nodes in a package
 */
export function preloadPackageUI(packageId: string): number {
  let loaded = 0;

  // This would iterate through all nodes for the package
  // For now, components are loaded on-demand
  logger.debug(`Pre-loading UI for package ${packageId}`);

  return loaded;
}

/**
 * usePackages - Hook for managing .zipp packages
 *
 * Provides functionality for installing, uninstalling, opening, and managing
 * portable workflow packages.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  ZippPackageManifest,
  PackagePermission,
  InstalledPackage,
  PackageStatus,
  PackageTrustLevel,
  Flow,
  QuickExportOptions,
  QuickExportResult,
} from 'zipp-core';
import { packageLogger as logger } from '../utils/logger';

// Re-export types from zipp-core for convenience
export type { ZippPackageManifest, PackagePermission, InstalledPackage };

/**
 * Compact package info returned by list_packages
 */
export interface PackageInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  installPath: string;
  status: PackageStatus;
  trustLevel: PackageTrustLevel;
}

/**
 * Event payload for package-related events
 */
export interface PackageEvent {
  type: string;
  packageId: string;
  serviceId?: string;
  error?: string;
  timestamp: number;
}

interface UsePackagesOptions {
  /** Auto-load packages on mount */
  autoLoad?: boolean;
}

/**
 * Hook for managing .zipp packages
 */
export function usePackages(options: UsePackagesOptions = {}) {
  const { autoLoad = true } = options;

  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [activePackage, setActivePackage] = useState<InstalledPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  // Load all installed packages
  const loadPackages = useCallback(async () => {
    try {
      if (!mountedRef.current) return;
      setError(null);
      setLoading(true);

      const packageList = await invoke<PackageInfo[]>('list_packages');

      if (!mountedRef.current) return;
      setPackages(packageList);
    } catch (err) {
      logger.error('Failed to load packages', { error: err });
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;

    if (autoLoad) {
      loadPackages();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoLoad, loadPackages]);

  // Read a package file without installing
  const readPackage = useCallback(async (path: string): Promise<ZippPackageManifest | null> => {
    try {
      const manifest = await invoke<ZippPackageManifest>('read_package', {
        packagePath: path,
      });
      return manifest;
    } catch (err) {
      logger.error('Failed to read package', { error: err });
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  // Install a package from a .zipp file
  const installPackage = useCallback(async (
    path: string,
    trust: boolean = false
  ): Promise<InstalledPackage | null> => {
    // Use path as temporary ID while installing
    const tempId = path;
    setInstalling(prev => ({ ...prev, [tempId]: true }));

    try {
      setError(null);

      const installed = await invoke<InstalledPackage>('install_package', {
        packagePath: path,
        trust,
      });

      // Reload package list
      await loadPackages();

      return installed;
    } catch (err) {
      logger.error('Failed to install package', { error: err });
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setInstalling(prev => ({ ...prev, [tempId]: false }));
    }
  }, [loadPackages]);

  // Uninstall a package
  const uninstallPackage = useCallback(async (packageId: string): Promise<boolean> => {
    try {
      setError(null);

      await invoke('uninstall_package', { packageId });

      // If this was the active package, clear it
      if (activePackage?.manifest.id === packageId) {
        setActivePackage(null);
      }

      // Reload package list
      await loadPackages();

      return true;
    } catch (err) {
      logger.error('Failed to uninstall package', { error: err });
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [activePackage, loadPackages]);

  // Open a package (set as active)
  const openPackage = useCallback(async (packageId: string): Promise<InstalledPackage | null> => {
    try {
      setError(null);

      const pkg = await invoke<InstalledPackage>('get_package', { packageId });
      setActivePackage(pkg);

      return pkg;
    } catch (err) {
      logger.error('Failed to open package', { error: err });
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  // Close the active package
  const closeActivePackage = useCallback(async () => {
    if (!activePackage) return;

    try {
      // Stop any running services for this package
      await invoke('stop_package_services', {
        packageId: activePackage.manifest.id,
      });
    } catch (err) {
      logger.error('Failed to stop package services', { error: err });
    }

    setActivePackage(null);
  }, [activePackage]);

  // Update package trust level
  const setPackageTrust = useCallback(async (
    packageId: string,
    trustLevel: PackageTrustLevel,
    grantedPermissions: PackagePermission[]
  ): Promise<boolean> => {
    try {
      await invoke('set_package_trust', {
        packageId,
        trustLevel,
        grantedPermissions,
      });

      // Reload packages to get updated state
      await loadPackages();

      return true;
    } catch (err) {
      logger.error('Failed to update package trust', { error: err });
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [loadPackages]);

  // Read a flow from a package
  const readPackageFlow = useCallback(async (
    packageId: string,
    flowPath: string
  ): Promise<string | null> => {
    try {
      const content = await invoke<string>('read_package_flow', {
        packageId,
        flowPath,
      });
      return content;
    } catch (err) {
      logger.error('Failed to read package flow', { error: err });
      return null;
    }
  }, []);

  // Start a package service
  const startPackageService = useCallback(async (
    packageId: string,
    serviceId: string,
    servicePath: string,
    preferredPort?: number,
    envVars?: Record<string, string>
  ): Promise<boolean> => {
    try {
      await invoke('start_package_service', {
        packageId,
        serviceId,
        servicePath,
        preferredPort,
        envVars,
      });
      return true;
    } catch (err) {
      logger.error('Failed to start package service', { error: err });
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  // Stop all services for a package
  const stopPackageServices = useCallback(async (packageId: string): Promise<number> => {
    try {
      const count = await invoke<number>('stop_package_services', { packageId });
      return count;
    } catch (err) {
      logger.error('Failed to stop package services', { error: err });
      return 0;
    }
  }, []);

  // Check if a path is a .zipp package file
  const isPackageFile = useCallback(async (path: string): Promise<boolean> => {
    try {
      return await invoke<boolean>('is_package_file', { path });
    } catch {
      return false;
    }
  }, []);

  // Get packages directory path
  const getPackagesDirectory = useCallback(async (): Promise<string | null> => {
    try {
      return await invoke<string>('get_packages_directory');
    } catch {
      return null;
    }
  }, []);

  // Export a flow as a .zipp package
  const exportFlowAsPackage = useCallback(async (
    flow: Flow,
    macros: Flow[],
    options: {
      name: string;
      version: string;
      description?: string;
      author?: string;
      includeMacros?: boolean;
      embedAssets?: boolean;
      selectedMacros?: string[];
      tags?: string[];
      outputPath?: string;
    }
  ): Promise<QuickExportResult> => {
    try {
      setError(null);

      // Prepare macros to include
      const macrosToInclude = options.includeMacros && options.selectedMacros
        ? macros.filter(m => options.selectedMacros!.includes(m.id))
        : [];

      // Create export options
      const exportOptions: QuickExportOptions = {
        flowId: flow.id,
        name: options.name,
        version: options.version,
        description: options.description,
        author: options.author,
        includeMacros: options.includeMacros,
        embedAssets: options.embedAssets,
        tags: options.tags,
        outputPath: options.outputPath,
      };

      // Call the Tauri command to export
      const result = await invoke<QuickExportResult>('export_flow_as_package', {
        flow: JSON.stringify(flow),
        macros: JSON.stringify(macrosToInclude),
        options: exportOptions,
      });

      return result;
    } catch (err) {
      logger.error('Failed to export flow as package', { error: err });
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  return {
    // State
    packages,
    activePackage,
    loading,
    installing,
    error,

    // Package management
    loadPackages,
    readPackage,
    installPackage,
    uninstallPackage,
    openPackage,
    closeActivePackage,
    setPackageTrust,
    readPackageFlow,

    // Package services
    startPackageService,
    stopPackageServices,

    // Utilities
    isPackageFile,
    getPackagesDirectory,

    // Export
    exportFlowAsPackage,
  };
}

/**
 * Hook to subscribe to package events
 */
export function usePackageEvents(onEvent: (event: PackageEvent) => void) {
  useEffect(() => {
    let unlisteners: UnlistenFn[] = [];

    const eventTypes = [
      'package:installing',
      'package:installed',
      'package:uninstalling',
      'package:uninstalled',
      'package:opening',
      'package:opened',
      'package:closing',
      'package:closed',
      'package:error',
      'package:service:starting',
      'package:service:started',
      'package:service:stopping',
      'package:service:stopped',
      'package:service:error',
    ];

    // Subscribe to all package events
    Promise.all(
      eventTypes.map(eventType =>
        listen<PackageEvent>(eventType, event => {
          onEvent(event.payload);
        })
      )
    )
      .then(fns => {
        unlisteners = fns;
      })
      .catch(err => {
        logger.error('Failed to subscribe to events', { error: err });
      });

    return () => {
      unlisteners.forEach(fn => fn());
    };
  }, [onEvent]);
}

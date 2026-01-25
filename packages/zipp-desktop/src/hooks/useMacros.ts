/**
 * Hook to load macros from the macros folder
 */
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Flow } from 'zipp-core';
import { createLogger } from '../utils/logger';

const logger = createLogger('Macros');

interface UseMacrosOptions {
  autoLoad?: boolean;
}

export function useMacros(options: UseMacrosOptions = {}) {
  const { autoLoad = true } = options;

  const [macros, setMacros] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [macrosDirectory, setMacrosDirectory] = useState<string | null>(null);

  // Load all macros from the macros folder
  const loadMacros = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get macros directory path
      try {
        const dir = await invoke<string>('get_macros_directory');
        setMacrosDirectory(dir);
      } catch {
        // Directory might not exist yet
        setMacrosDirectory(null);
      }

      // Load all macro JSON files
      const macroData = await invoke<unknown[]>('load_all_macros');

      // Convert to Flow type
      const loadedMacros: Flow[] = macroData.map((data) => {
        const macro = data as Record<string, unknown>;
        return {
          id: macro.id as string,
          name: macro.name as string,
          description: (macro.description as string) || '',
          isMacro: true,
          tags: (macro.tags as string[]) || [],
          createdAt: (macro.createdAt as string) || new Date().toISOString(),
          updatedAt: (macro.updatedAt as string) || new Date().toISOString(),
          graph: {
            nodes: (macro.nodes as Flow['graph']['nodes']) || [],
            edges: (macro.edges as Flow['graph']['edges']) || [],
          },
        } as Flow;
      });

      setMacros(loadedMacros);
    } catch (err) {
      logger.error('Failed to load macros', { error: err });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadMacros();
    }
  }, [autoLoad, loadMacros]);

  return {
    macros,
    loading,
    error,
    macrosDirectory,
    loadMacros,
  };
}

export default useMacros;

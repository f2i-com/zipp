/**
 * Job Queue Context
 *
 * Provides global access to the JobManager for workflow execution queue management.
 * Enables background execution, job tracking, and configurable concurrency.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import {
  JobManager,
  type Job,
  type JobConfig,
  type LogEntry,
  type Flow,
  type WorkflowGraph,
  type ProjectSettings,
  type LocalNetworkPermissionRequest,
  type LocalNetworkPermissionResponse,
  type DatabaseRequest,
  type DatabaseResult,
} from 'zipp-core';
import { getModuleLoader } from 'zipp-core';
import * as db from '../services/database';
import { getFlowDatabaseManager } from '../services/database';
import { useApiBridge, type ApiBridgeCallbacks } from '../hooks/useApiBridge';
import { createLogger } from '../utils/logger';

const logger = createLogger('JobQueue');

/**
 * Context value type
 */
interface JobQueueContextValue {
  /** The JobManager instance */
  jobManager: JobManager;
  /** All jobs (active + queued + history) */
  jobs: Job[];
  /** Currently active jobs */
  activeJobs: Job[];
  /** Queued (pending) jobs */
  queuedJobs: Job[];
  /** Job history */
  history: Job[];
  /** Queue configuration */
  config: JobConfig;
  /** Update queue configuration */
  setConfig: (config: Partial<JobConfig>) => void;
  /** Check if a specific flow has a running job */
  isFlowRunning: (flowId: string) => boolean;
  /** Get the job for a specific flow (if any) */
  getJobForFlow: (flowId: string) => Job | undefined;
  /** Clear job history */
  clearHistory: () => void;
  /** Submit a job to the queue */
  submitJob: (flowId: string, graph: WorkflowGraph, inputs?: Record<string, unknown>, flowName?: string) => string;
  /** Subscribe to updates for a specific job */
  subscribeToJob: (jobId: string, callback: (job: Job) => void) => () => void;
}

const JobQueueContext = createContext<JobQueueContextValue | null>(null);

/**
 * Props for the JobQueueProvider
 */
interface JobQueueProviderProps {
  children: ReactNode;
  /** Available flows for subflow execution */
  availableFlows?: Flow[];
  /** Package macros (higher priority than project macros) */
  packageMacros?: Flow[];
  /** Project settings */
  projectSettings?: ProjectSettings;
  /** Handler for local network permission requests */
  onLocalNetworkPermission?: (
    request: LocalNetworkPermissionRequest
  ) => Promise<LocalNetworkPermissionResponse>;
  /** Callback when project settings should be updated */
  onUpdateSettings?: (updates: Partial<ProjectSettings>) => void;
  /** Callback to create a new flow via API */
  onCreateFlow?: (name: string) => Flow;
  /** Callback to delete a flow via API */
  onDeleteFlow?: (flowId: string) => void;
  /** Callback to update a flow via API */
  onUpdateFlow?: (flowId: string, updates: Partial<Omit<Flow, 'id' | 'createdAt'>>) => void;
  /** Callback to update a flow's graph via API */
  onUpdateFlowGraph?: (flowId: string, graph: WorkflowGraph) => void;
  /** Callback to clear application cache via API */
  onClearCache?: () => Promise<void>;
  /** Callback to reload macros via API */
  onReloadMacros?: () => Promise<void>;
  /** Callback to recompile packages via API */
  onRecompilePackages?: () => Promise<{ success: boolean; output?: string; error?: string }>;
}

/**
 * Database handler for JobManager
 * Uses FlowDatabaseManager for per-flow isolation when flowId is provided
 * Falls back to legacy shared database for backward compatibility
 */
const createDatabaseHandler = () => {
  return async (request: DatabaseRequest): Promise<DatabaseResult> => {
    try {
      const { operation, collectionName, data, filter, flowId, packageId } = request;
      const collection = collectionName || 'workflow_data';


      // Use per-flow database if flowId is provided
      if (flowId) {
        const flowDbManager = getFlowDatabaseManager();

        switch (operation) {
          case 'insert': {
            if (Array.isArray(data)) {
              for (const item of data) {
                await flowDbManager.insertDocument(flowId, collection, item as Record<string, unknown>, undefined, packageId);
              }
              return { success: true, rowsAffected: data.length };
            } else if (data) {
              const id = await flowDbManager.insertDocument(flowId, collection, data as Record<string, unknown>, undefined, packageId);
              return { success: true, insertedId: id };
            }
            return { success: false, error: 'No data provided' };
          }

          case 'query': {
            const docs = await flowDbManager.findDocuments(flowId, collection, filter, undefined, undefined, packageId);
            return {
              success: true,
              data: docs.map(doc => ({
                id: doc.id,
                _id: doc.id,
                _created: doc.created_at,
                ...doc.data,
              })),
            };
          }

          case 'update': {
            if (!filter?.id) {
              return { success: false, error: 'Update requires filter.id' };
            }
            const updated = await flowDbManager.updateDocument(flowId, String(filter.id), data as Record<string, unknown>, packageId);
            return { success: true, rowsAffected: updated ? 1 : 0 };
          }

          case 'delete': {
            if (!filter?.id) {
              return { success: false, error: 'Delete requires filter.id' };
            }
            const deleted = await flowDbManager.deleteDocument(flowId, String(filter.id), packageId);
            return { success: true, rowsAffected: deleted ? 1 : 0 };
          }

          case 'raw_sql': {
            if (!request.rawSql) {
              return { success: false, error: 'raw_sql operation requires rawSql field' };
            }
            const result = await flowDbManager.executeRawSql(flowId, request.rawSql, request.params, packageId);
            return {
              success: true,
              data: result.rows as Record<string, unknown>[],
              rowsAffected: result.rowsAffected,
            };
          }

          default:
            return { success: false, error: `Unknown operation: ${operation}` };
        }
      }

      // Legacy: Use shared database when no flowId provided
      switch (operation) {
        case 'insert': {
          if (Array.isArray(data)) {
            for (const item of data) {
              await db.insertDocument(collection, item as Record<string, unknown>);
            }
            return { success: true, rowsAffected: data.length };
          } else if (data) {
            const id = await db.insertDocument(collection, data as Record<string, unknown>);
            return { success: true, insertedId: id };
          }
          return { success: false, error: 'No data provided' };
        }

        case 'query': {
          const docs = await db.findDocuments(collection, filter);
          return {
            success: true,
            data: docs.map(doc => ({
              id: doc.id,
              _id: doc.id,
              _created: doc.created_at,
              ...doc.data,
            })),
          };
        }

        case 'update': {
          if (!filter?.id) {
            return { success: false, error: 'Update requires filter.id' };
          }
          const updated = await db.updateDocument(String(filter.id), data as Record<string, unknown>);
          return { success: true, rowsAffected: updated ? 1 : 0 };
        }

        case 'delete': {
          if (!filter?.id) {
            return { success: false, error: 'Delete requires filter.id' };
          }
          const deleted = await db.deleteDocument(String(filter.id));
          return { success: true, rowsAffected: deleted ? 1 : 0 };
        }

        default:
          return { success: false, error: `Unknown operation: ${operation}` };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Database operation failed', { error });
      return { success: false, error: errorMsg || 'Unknown error' };
    }
  };
};

/**
 * Job Queue Provider component
 */
export function JobQueueProvider({
  children,
  availableFlows = [],
  packageMacros = [],
  projectSettings,
  onLocalNetworkPermission,
  onUpdateSettings,
  onCreateFlow,
  onDeleteFlow,
  onUpdateFlow,
  onUpdateFlowGraph,
  onClearCache,
  onReloadMacros,
  onRecompilePackages,
}: JobQueueProviderProps) {
  // Use refs to always access current values in the network permission handler
  // This prevents stale closures from capturing initial prop values
  const projectSettingsRef = useRef(projectSettings);
  const onUpdateSettingsRef = useRef(onUpdateSettings);
  const onLocalNetworkPermissionRef = useRef(onLocalNetworkPermission);

  // Keep refs in sync with props
  useEffect(() => {
    projectSettingsRef.current = projectSettings;
  }, [projectSettings]);

  useEffect(() => {
    onUpdateSettingsRef.current = onUpdateSettings;
  }, [onUpdateSettings]);

  useEffect(() => {
    onLocalNetworkPermissionRef.current = onLocalNetworkPermission;
  }, [onLocalNetworkPermission]);

  // Create JobManager instance using useState with lazy initializer
  // The network permission handler captures refs, which is intentional for accessing
  // current prop values without recreating the JobManager on every prop change.
  // eslint-disable-next-line react-hooks/refs
  const [jobManager] = useState(() => {
    // Create handler that uses refs to access current values
    const networkPermissionHandler = async (request: LocalNetworkPermissionRequest): Promise<LocalNetworkPermissionResponse> => {
      const permissionCallback = onLocalNetworkPermissionRef.current;
      if (!permissionCallback) {
        // No permission handler - deny by default
        return { allowed: false, remember: false };
      }

      const response = await permissionCallback(request);

      // If user allowed and wants to remember, update the whitelist
      if (response.allowed && response.remember) {
        const updateSettings = onUpdateSettingsRef.current;
        const currentSettings = projectSettingsRef.current;
        if (updateSettings) {
          const currentWhitelist = currentSettings?.localNetworkWhitelist || [];
          if (!currentWhitelist.includes(request.hostPort)) {
            updateSettings({
              localNetworkWhitelist: [...currentWhitelist, request.hostPort],
            });
          }
        }
      }
      return response;
    };

    return new JobManager({
      databaseHandler: createDatabaseHandler(),
      networkPermissionHandler,
      moduleRegistry: getModuleLoader(),
      availableFlows,
      packageMacros,
      projectSettings,
    });
  });

  // State for reactive updates
  const [jobs, setJobs] = useState<Job[]>([]);
  const [config, setConfigState] = useState<JobConfig>(() => jobManager.getConfig());

  // Update JobManager when props change
  useEffect(() => {
    jobManager.setAvailableFlows(availableFlows);
  }, [availableFlows, jobManager]);

  // Update package macros when they change
  useEffect(() => {
    jobManager.setPackageMacros(packageMacros);
  }, [packageMacros, jobManager]);

  useEffect(() => {
    if (projectSettings) {
      jobManager.setProjectSettings(projectSettings);
    }
  }, [projectSettings, jobManager]);

  // Subscribe to job state changes
  useEffect(() => {
    const unsubscribe = jobManager.onStateChange((allJobs) => {
      setJobs([...allJobs]);
    });
    return unsubscribe;
  }, [jobManager]);

  // Config update handler
  const setConfig = useCallback(
    (newConfig: Partial<JobConfig>) => {
      jobManager.setConfig(newConfig);
      setConfigState(jobManager.getConfig());
    },
    [jobManager]
  );

  // Flow running check
  const isFlowRunning = useCallback(
    (flowId: string) => jobManager.isFlowRunning(flowId),
    [jobManager]
  );

  // Get job for flow
  const getJobForFlow = useCallback(
    (flowId: string) => jobManager.getJobForFlow(flowId),
    [jobManager]
  );

  // Clear history
  const clearHistory = useCallback(() => {
    jobManager.clearHistory();
  }, [jobManager]);

  // Submit a job
  const submitJob = useCallback(
    (flowId: string, graph: WorkflowGraph, inputs?: Record<string, unknown>, flowName?: string): string => {
      // Cast inputs to WorkflowInputs type (the runtime will handle type checking)
      return jobManager.submit(flowId, flowName || 'Unnamed', graph, inputs as Record<string, string | number | boolean | object> | undefined);
    },
    [jobManager]
  );

  // Subscribe to a specific job's updates
  const subscribeToJob = useCallback(
    (jobId: string, callback: (job: Job) => void): (() => void) => {
      // Subscribe to state changes and filter for the specific job
      return jobManager.onStateChange((allJobs) => {
        const job = allJobs.find(j => j.id === jobId);
        if (job) {
          callback(job);
        }
      });
    },
    [jobManager]
  );

  // Derived state
  const activeJobs = jobs.filter(j => j.status === 'running');
  const queuedJobs = jobs.filter(j => j.status === 'pending');
  const history = jobs.filter(j => ['completed', 'failed', 'aborted'].includes(j.status));

  // Initialize API bridge for external HTTP API access
  const apiBridgeCallbacks: ApiBridgeCallbacks = {
    onCreateFlow,
    onDeleteFlow,
    onUpdateFlow,
    onUpdateFlowGraph,
    onClearCache,
    onReloadMacros,
    onRecompilePackages,
  };
  useApiBridge(jobManager, availableFlows, onCreateFlow, onDeleteFlow, apiBridgeCallbacks);

  const value: JobQueueContextValue = {
    jobManager,
    jobs,
    activeJobs,
    queuedJobs,
    history,
    config,
    setConfig,
    isFlowRunning,
    getJobForFlow,
    clearHistory,
    submitJob,
    subscribeToJob,
  };

  return (
    <JobQueueContext.Provider value={value}>
      {children}
    </JobQueueContext.Provider>
  );
}

/**
 * Hook to access the job queue context
 */
export function useJobQueue(): JobQueueContextValue {
  const context = useContext(JobQueueContext);
  if (!context) {
    throw new Error('useJobQueue must be used within a JobQueueProvider');
  }
  return context;
}

/**
 * Hook to subscribe to job logs for a specific job
 */
export function useJobLogs(jobId: string | null): LogEntry[] {
  const { jobManager } = useJobQueue();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!jobId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset logs when job changes
      setLogs([]);
      return;
    }

    // Get existing logs
    const job = jobManager.getJob(jobId);
    if (job) {
      setLogs([...job.logs]);
    }

    // Subscribe to new logs
    const unsubscribe = jobManager.onLog((logJobId, log) => {
      if (logJobId === jobId) {
        setLogs(prev => [...prev, log]);
      }
    });

    return unsubscribe;
  }, [jobId, jobManager]);

  return logs;
}

/**
 * Hook to subscribe to node status updates for a specific job
 * Uses a ref to avoid re-subscriptions when callback changes
 */
export function useJobNodeStatus(
  jobId: string | null,
  onStatus: (nodeId: string, status: 'running' | 'completed' | 'error') => void
) {
  const { jobManager } = useJobQueue();
  const onStatusRef = useRef(onStatus);

  // Keep ref in sync
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = jobManager.onNodeStatus((statusJobId, nodeId, status) => {
      if (statusJobId === jobId) {
        onStatusRef.current(nodeId, status);
      }
    });

    return unsubscribe;
  }, [jobId, jobManager]);
}

/**
 * Hook to subscribe to streaming tokens for a specific job
 * Uses a ref to avoid re-subscriptions when callback changes
 */
export function useJobStreamTokens(
  jobId: string | null,
  onToken: (nodeId: string, token: string) => void
) {
  const { jobManager } = useJobQueue();
  const onTokenRef = useRef(onToken);

  // Keep ref in sync
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = jobManager.onStreamToken((tokenJobId, nodeId, token) => {
      if (tokenJobId === jobId) {
        onTokenRef.current(nodeId, token);
      }
    });

    return unsubscribe;
  }, [jobId, jobManager]);
}

/**
 * Hook to subscribe to image updates for a specific job
 * Uses a ref to avoid re-subscriptions when callback changes
 */
export function useJobImageUpdates(
  jobId: string | null,
  onImage: (nodeId: string, imageUrl: string) => void
) {
  const { jobManager } = useJobQueue();
  const onImageRef = useRef(onImage);

  // Keep ref in sync
  useEffect(() => {
    onImageRef.current = onImage;
  });

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = jobManager.onImageUpdate((imageJobId, nodeId, imageUrl) => {
      if (imageJobId === jobId) {
        onImageRef.current(nodeId, imageUrl);
      }
    });

    return unsubscribe;
  }, [jobId, jobManager]);
}

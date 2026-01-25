/**
 * Workflow Execution Hook
 *
 * Handles workflow execution lifecycle including job submission, running, stopping,
 * and completion handling. Extracts execution logic from ZippBuilder.tsx for better
 * separation of concerns and testability.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { invoke } from '@tauri-apps/api/core';
import {
  useJobQueue,
  useJobLogs,
  useJobNodeStatus,
  useJobStreamTokens,
  useJobImageUpdates,
} from '../contexts/JobQueueContext';
import type { WorkflowGraph, LogEntry, ZippPackageManifest } from 'zipp-core';
import { createLogger } from '../utils/logger';

const logger = createLogger('WorkflowExecution');

export interface UseWorkflowExecutionOptions {
  flowId: string;
  flowName: string;
  isMacro: boolean;
  nodes: Node[];
  edges: Edge[];
  getWorkflowGraph: () => WorkflowGraph | null;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  /** Check if workflow has input nodes that need configuration */
  hasInputNodes: (nodes: Node[]) => boolean;
  /** Package mode for service checking */
  packageMode?: {
    manifest: ZippPackageManifest;
    flow: unknown;
    sourcePath: string;
  } | null;
}

export interface WorkflowExecutionState {
  /** Whether the workflow is currently running */
  isRunning: boolean;
  /** Current job ID if one is active */
  currentJobId: string | null;
  /** Combined logs from job queue or local logs */
  logs: LogEntry[];
  /** Whether the run workflow modal should be shown */
  showRunModal: boolean;
  /** Whether the service startup dialog should be shown */
  showServiceDialog: boolean;
  /** Whether we're transitioning between flows (for loading state) */
  flowTransitioning: boolean;
}

export interface WorkflowExecutionActions {
  /** Run the workflow (may show modal if inputs needed) */
  runWorkflow: () => Promise<void>;
  /** Stop the running workflow */
  stopWorkflow: () => void;
  /** Clear all logs */
  clearLogs: () => void;
  /** Close the run workflow modal */
  closeRunModal: () => void;
  /** Confirm run modal and start execution */
  confirmRunModal: (updatedInputs: Map<string, Record<string, unknown>>) => void;
  /** Close the service dialog */
  closeServiceDialog: () => void;
  /** Proceed after service dialog (services started) */
  proceedAfterServiceDialog: () => void;
  /** Mark flow transition as complete */
  finishFlowTransition: () => void;
}

export function useWorkflowExecution({
  flowId,
  flowName,
  isMacro,
  nodes,
  edges,
  getWorkflowGraph,
  setNodes,
  updateNodeData,
  onShowToast,
  hasInputNodes,
  packageMode,
}: UseWorkflowExecutionOptions): WorkflowExecutionState & WorkflowExecutionActions {
  // Job queue integration
  const { jobManager, isFlowRunning, getJobForFlow, jobs } = useJobQueue();

  // Track manually started jobs (set when user clicks run button)
  const [manualJobId, setManualJobId] = useState<string | null>(null);

  // Local logs state for when there's no active job
  const [localLogs, setLocalLogs] = useState<LogEntry[]>([]);

  // Modal states
  const [showRunModal, setShowRunModal] = useState(false);
  const [showServiceDialog, setShowServiceDialog] = useState(false);

  // Flow transition state
  const [flowTransitioning, setFlowTransitioning] = useState(false);
  const prevFlowIdRef = useRef(flowId);

  // Derive the active job ID from the job queue
  const activeJobFromQueue = useMemo(() => {
    const existingJob = getJobForFlow(flowId);
    return existingJob && existingJob.status === 'running' ? existingJob.id : null;
  }, [flowId, getJobForFlow]);

  // The current job is either the manually started job or the active job from queue
  const currentJobId = manualJobId || activeJobFromQueue;

  // Track if this flow is running
  const isRunning = isFlowRunning(flowId) || (currentJobId !== null && getJobForFlow(flowId)?.status === 'running');

  // Get logs for the current job
  const jobLogs = useJobLogs(currentJobId);
  const logs = currentJobId ? jobLogs : localLogs;

  // Auto-reconnect to running job when navigating back to a flow
  useEffect(() => {
    if (prevFlowIdRef.current !== flowId) {
      const oldFlowId = prevFlowIdRef.current;
      prevFlowIdRef.current = flowId;

      // Check if there's a running job for the NEW flow we're navigating to
      const runningJobForNewFlow = getJobForFlow(flowId);
      if (runningJobForNewFlow?.status === 'running') {
        // Auto-reconnect to the running job
        setManualJobId(runningJobForNewFlow.id);
        onShowToast?.('Reconnected to running job', 'info');
      } else {
        // Only clear manualJobId if the old job was for the old flow
        const currentJob = manualJobId ? getJobForFlow(flowId) : null;
        if (!currentJob || currentJob.flowId !== flowId) {
          setManualJobId(null);
        }
      }

      // Show loading state during flow transition
      setFlowTransitioning(true);

      logger.debug(`Flow changed from ${oldFlowId} to ${flowId}`);
    }
  }, [flowId, getJobForFlow, manualJobId, onShowToast]);

  // Subscribe to node status updates for this job
  useJobNodeStatus(
    currentJobId,
    useCallback(
      (nodeId: string, status: 'running' | 'completed' | 'error') => {
        updateNodeData(nodeId, { _status: status });
      },
      [updateNodeData]
    )
  );

  // Subscribe to streaming tokens for this job
  useJobStreamTokens(
    currentJobId,
    useCallback((_nodeId: string, _token: string) => {
      // Could be used for live streaming display in the future
    }, [])
  );

  // Subscribe to image updates for this job
  useJobImageUpdates(
    currentJobId,
    useCallback(
      (nodeId: string, imageUrl: string) => {
        updateNodeData(nodeId, { imageUrl });
      },
      [updateNodeData]
    )
  );

  // Track which job we've already processed for completion
  const processedJobRef = useRef<string | null>(null);

  // Watch for job completion to update Output nodes with results
  useEffect(() => {
    if (!currentJobId) {
      processedJobRef.current = null;
      return;
    }

    // Find the current job by ID
    const job = jobs.find((j) => j.id === currentJobId);
    if (!job) return;

    // Only process completion once per job
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'aborted') {
      if (processedJobRef.current === job.id) return; // Already processed
      processedJobRef.current = job.id;

      // Job completed, update nodes with final results
      if (job.status === 'completed' && job.result !== undefined) {
        const result = job.result;
        let outputValue: string | string[] = '';

        if (result && typeof result === 'object') {
          const resultObj = result as Record<string, unknown>;
          if (resultObj.__output__ !== undefined) {
            outputValue = resultObj.__output__ as string | string[];
          } else {
            outputValue = JSON.stringify(result);
          }
        } else if (result !== null && result !== undefined) {
          outputValue = String(result);
        }

        const resultObj = result as Record<string, unknown>;

        setNodes((nds) => {
          const currentEdges = edges;

          return nds.map((node) => {
            const updates: Record<string, unknown> = {};

            // Update output nodes with the result from their connected source
            if (node.type === 'output') {
              const incomingEdge = currentEdges.find((e) => e.target === node.id);
              if (incomingEdge && resultObj[incomingEdge.source] !== undefined) {
                const sourceValue = resultObj[incomingEdge.source];
                updates.outputValue = Array.isArray(sourceValue) ? sourceValue[0] : sourceValue;
              } else if (outputValue) {
                updates.outputValue = outputValue;
              }
            }

            // Update video_save nodes with result
            if (node.type === 'video_save') {
              if (resultObj[node.id]) {
                const nodeValue = resultObj[node.id];
                const videoPath = Array.isArray(nodeValue) ? nodeValue[0] : nodeValue;
                if (typeof videoPath === 'string' && videoPath) {
                  updates.outputValue = videoPath;
                }
              } else {
                const incomingEdge = currentEdges.find((e) => e.target === node.id);
                if (incomingEdge && resultObj[incomingEdge.source]) {
                  const sourceValue = resultObj[incomingEdge.source];
                  const videoPath = Array.isArray(sourceValue) ? sourceValue[0] : sourceValue;
                  if (typeof videoPath === 'string' && videoPath) {
                    updates.outputValue = videoPath;
                  }
                }
              }
            }

            // Update image_save nodes with result
            if (node.type === 'image_save') {
              const existingUrl = node.data.imageUrl as string | undefined;
              const hasDataUrl = existingUrl?.startsWith('data:');

              if (!hasDataUrl) {
                if (resultObj[node.id]) {
                  const nodeValue = resultObj[node.id];
                  const imagePath = Array.isArray(nodeValue) ? nodeValue[0] : nodeValue;
                  if (typeof imagePath === 'string' && imagePath) {
                    updates.imageUrl = imagePath;
                  }
                } else {
                  const incomingEdge = currentEdges.find((e) => e.target === node.id);
                  if (incomingEdge && resultObj[incomingEdge.source]) {
                    const sourceValue = resultObj[incomingEdge.source];
                    const imagePath = Array.isArray(sourceValue) ? sourceValue[0] : sourceValue;
                    if (typeof imagePath === 'string' && imagePath) {
                      updates.imageUrl = imagePath;
                    }
                  }
                }
              }
            }

            // Clear status
            if (node.data._status) {
              updates._status = undefined;
            }

            if (Object.keys(updates).length > 0) {
              return { ...node, data: { ...node.data, ...updates, _updateKey: Date.now() } };
            }
            return node;
          });
        });
      } else {
        // Just clear statuses for failed/aborted jobs
        setNodes((nds) =>
          nds.map((node) => {
            if (node.data._status) {
              return { ...node, data: { ...node.data, _status: undefined } };
            }
            return node;
          })
        );
      }
    }
  }, [currentJobId, jobs, setNodes, edges]);

  // Actually submit the workflow to the job queue
  const submitWorkflow = useCallback(() => {
    const graph = getWorkflowGraph();
    if (!graph || graph.nodes.length === 0) {
      onShowToast?.('Cannot run empty workflow', 'warning');
      return;
    }

    // Submit to job queue
    const jobId = jobManager.submit(flowId, flowName, graph);
    setManualJobId(jobId);
    setLocalLogs([]); // Clear local logs when starting new job
  }, [getWorkflowGraph, jobManager, flowId, flowName, onShowToast]);

  // Proceed with run after inputs are confirmed (handles service check)
  const proceedWithRun = useCallback(async () => {
    // If in package mode with services, check if services need to be started
    if (packageMode?.manifest.services && packageMode.manifest.services.length > 0) {
      try {
        // Check current service status
        const statuses = await invoke<Array<{ id: string; running: boolean; port?: number }>>('get_package_services', {
          packageId: packageMode.manifest.id,
        });

        // Check if all services are running
        const allRunning = packageMode.manifest.services.every((svc) => {
          const status = statuses.find((st) => st.id.endsWith(`::${svc.id}`));
          return status?.running === true;
        });

        if (!allRunning) {
          // Show service startup dialog
          setShowServiceDialog(true);
          return;
        }
      } catch (err) {
        logger.error('Failed to check service status', { error: err });
        // Continue anyway - maybe services aren't needed or user will see errors in the logs
      }
    }

    // All services running or no services needed - submit workflow
    submitWorkflow();
  }, [packageMode, submitWorkflow]);

  // Ref to hold latest proceedWithRun to avoid stale closure
  const proceedWithRunRef = useRef(proceedWithRun);
  useEffect(() => {
    proceedWithRunRef.current = proceedWithRun;
  }, [proceedWithRun]);

  // Ref to track confirm timeout for cleanup
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup confirm timeout on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  // Handle run modal confirmation
  const confirmRunModal = useCallback(
    (updatedInputs: Map<string, Record<string, unknown>>) => {
      setShowRunModal(false);

      // Update node data with new input values
      updatedInputs.forEach((data, nodeId) => {
        updateNodeData(nodeId, data);
      });

      // Clear any previous timeout
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }

      // Small delay to ensure node updates are processed
      confirmTimeoutRef.current = setTimeout(() => {
        proceedWithRunRef.current();
        confirmTimeoutRef.current = null;
      }, 50);
    },
    [updateNodeData]
  );

  // Run workflow via job queue
  const runWorkflow = useCallback(async () => {
    // Macros cannot be run directly
    if (isMacro) {
      onShowToast?.('Macros cannot be run directly. Use this macro as a node in another flow.', 'warning');
      return;
    }

    const graph = getWorkflowGraph();
    if (!graph || graph.nodes.length === 0) {
      onShowToast?.('Cannot run empty workflow', 'warning');
      return;
    }

    // Show run modal if there are input nodes to configure
    if (hasInputNodes(nodes)) {
      setShowRunModal(true);
      return;
    }

    // No input nodes - proceed directly
    proceedWithRun();
  }, [getWorkflowGraph, onShowToast, isMacro, nodes, proceedWithRun, hasInputNodes]);

  // Stop workflow via job queue
  const stopWorkflow = useCallback(() => {
    if (currentJobId) {
      jobManager.abort(currentJobId);
    }
  }, [currentJobId, jobManager]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLocalLogs([]);
    setManualJobId(null);
  }, []);

  // Modal controls
  const closeRunModal = useCallback(() => {
    setShowRunModal(false);
  }, []);

  const closeServiceDialog = useCallback(() => {
    setShowServiceDialog(false);
  }, []);

  const proceedAfterServiceDialog = useCallback(() => {
    setShowServiceDialog(false);
    submitWorkflow();
  }, [submitWorkflow]);

  const finishFlowTransition = useCallback(() => {
    setFlowTransitioning(false);
  }, []);

  return {
    // State
    isRunning,
    currentJobId,
    logs,
    showRunModal,
    showServiceDialog,
    flowTransitioning,
    // Actions
    runWorkflow,
    stopWorkflow,
    clearLogs,
    closeRunModal,
    confirmRunModal,
    closeServiceDialog,
    proceedAfterServiceDialog,
    finishFlowTransition,
  };
}

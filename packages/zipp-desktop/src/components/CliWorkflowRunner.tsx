/**
 * CLI Workflow Runner
 *
 * Handles workflow execution when app is started with --run flag.
 * Runs in hidden window mode for cron jobs and CLI automation.
 */

import { useEffect, useRef, useState } from 'react';
import { useCliRunMode } from '../hooks/useCliRunMode';
import { useJobQueue } from '../contexts/JobQueueContext';
import { createLogger } from '../utils/logger';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

const logger = createLogger('CLI-Runner');

interface CliWorkflowRunnerProps {
  onComplete?: () => void;
}

/**
 * Component that handles CLI workflow execution
 * Should be rendered when the app is started with --run flag
 */
export function CliWorkflowRunner({ onComplete }: CliWorkflowRunnerProps) {
  const { workflowPath, inputs, writeOutput, exit } = useCliRunMode();
  const { submitJob, jobs } = useJobQueue();
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'running' | 'completed' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const hasExited = useRef(false);

  // Start workflow execution
  useEffect(() => {
    if (hasStarted.current || !workflowPath) return;
    hasStarted.current = true;

    async function runWorkflow() {
      try {
        logger.info('Loading workflow', { path: workflowPath });

        // Load workflow file
        let workflowData: { nodes: unknown[]; edges: unknown[] };

        // Check if it's a .zipp package or .json file
        const isPackage = workflowPath!.toLowerCase().endsWith('.zipp');

        if (isPackage) {
          // Load from package using Tauri command
          const content = await invoke<string>('read_package_flow_content', {
            packagePath: workflowPath,
          });
          workflowData = JSON.parse(content);
        } else {
          // Load JSON file directly
          const content = await readTextFile(workflowPath!);
          workflowData = JSON.parse(content);
        }

        // Parse input values if provided
        let inputValues: Record<string, unknown> = {};
        if (inputs) {
          try {
            inputValues = JSON.parse(inputs);
            logger.info('Using input values', { inputs: inputValues });
          } catch (e) {
            logger.warn('Failed to parse inputs JSON, using empty inputs', { error: e });
          }
        }

        setStatus('running');

        // Submit the workflow job
        const flowName = workflowPath!.split(/[/\\]/).pop() || 'CLI Workflow';
        const id = submitJob(
          'cli-run',
          { nodes: workflowData.nodes as never[], edges: workflowData.edges as never[] },
          inputValues,
          flowName
        );

        setJobId(id);
        logger.info('Workflow job started', { jobId: id });
      } catch (err) {
        if (hasExited.current) return;
        hasExited.current = true;

        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Failed to start workflow', { error: errMsg });
        setError(errMsg);
        setStatus('error');

        // Write error to output and exit with error code
        await writeOutput({ success: false, error: errMsg });
        await exit(1);
      }
    }

    runWorkflow();
  }, [workflowPath, inputs, submitJob, writeOutput, exit]);

  // Monitor job completion
  useEffect(() => {
    if (!jobId || hasExited.current) return;

    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    if (job.status === 'completed') {
      if (hasExited.current) return; // Guard against multiple calls
      hasExited.current = true;

      logger.info('Workflow completed successfully');
      setStatus('completed');

      // Write results and exit
      (async () => {
        await writeOutput({
          success: true,
          jobId,
          results: job.result || {},
          logs: job.logs,
        });
        onComplete?.();
        await exit(0);
      })();
    } else if (job.status === 'failed' || job.status === 'aborted') {
      if (hasExited.current) return; // Guard against multiple calls
      hasExited.current = true;

      const errMsg = job.error || 'Workflow failed';
      logger.error('Workflow failed', { error: errMsg });
      setError(errMsg);
      setStatus('error');

      // Write error and exit
      (async () => {
        await writeOutput({
          success: false,
          jobId,
          error: errMsg,
          logs: job.logs,
        });
        onComplete?.();
        await exit(1);
      })();
    }
  }, [jobId, jobs, writeOutput, exit, onComplete]);

  // This component doesn't render anything visible (hidden window mode)
  // But we can log status for debugging
  useEffect(() => {
    logger.info('CLI Runner status', { status, error, jobId });
  }, [status, error, jobId]);

  return null;
}

export default CliWorkflowRunner;

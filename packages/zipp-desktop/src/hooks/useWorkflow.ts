import { useState, useCallback, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useNodesState, useEdgesState, type Node, type Edge, addEdge, type Connection, type EdgeChange } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { NodeType, LogEntry, WorkflowGraph, Flow, DatabaseRequest, DatabaseResult, ProjectSettings } from 'zipp-core';
import { createRuntime, extractNodeOutputs, getModuleLoader } from 'zipp-core';
import * as db from '../services/database';
import { validateWorkflow as validateWorkflowUtil } from '../utils/WorkflowValidation';
import {
  migrateEdgeHandles,
  applyAutoLayout,
  graphToReactFlowNodes,
  graphToReactFlowEdges,
  prepareWorkflowForExport,
  parseWorkflowJson,
  workflowToReactFlow,
  reactFlowToWorkflowGraph,
} from '../utils/WorkflowIO';
import { getDefaultNodeData } from '../utils/NodeDefaults';
import { useClipboard } from './useClipboard';
import { workflowLogger } from '../utils/logger';

const AUTOSAVE_KEY = 'zipp_workflow_autosave';
const AUTOSAVE_DEBOUNCE_MS = 2000;

// Initial demo nodes - ComfyUI Image Generation
// Demonstrates: Text Input -> Image Gen (ComfyUI) -> Output
// Users can load their own ComfyUI workflow JSON into the Image Gen node
const initialNodes: Node[] = [
  {
    id: 'input-prompt',
    type: 'input_text',
    position: { x: 50, y: 100 },
    data: { value: 'A beautiful mountain landscape at sunset with dramatic clouds' },
  },
  {
    id: 'image-gen',
    type: 'image_gen',
    position: { x: 400, y: 50 },
    data: {
      apiFormat: 'comfyui',
      endpoint: 'http://localhost:8188',
    },
  },
  {
    id: 'output-image',
    type: 'output',
    position: { x: 780, y: 100 },
    data: { label: 'generated_image' },
  },
];

// Edge handle IDs must match the handle IDs defined in each node's UI component:
// - input_text outputs: 'text'
// - image_gen inputs: 'prompt', outputs: 'image'
// - output inputs: 'result'
const initialEdges: Edge[] = [
  { id: 'e1', source: 'input-prompt', sourceHandle: 'text', target: 'image-gen', targetHandle: 'prompt' },
  { id: 'e2', source: 'image-gen', sourceHandle: 'image', target: 'output-image', targetHandle: 'result' },
];

// Try to load saved workflow from localStorage
const loadAutosaved = (): { nodes: Node[]; edges: Edge[] } | null => {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.nodes && parsed.edges) {
        return parsed;
      }
    }
  } catch {
    // Silently fail on autosave load - use default state
  }
  return null;
};

// Get initial state - prefer autosaved, fallback to demo
const getInitialState = () => {
  const autosaved = loadAutosaved();
  if (autosaved) {
    // Migrate old handle IDs to new semantic names, and filter out any self-loop edges
    const migratedEdges = migrateEdgeHandles(autosaved.edges, autosaved.nodes)
      .filter(e => e.source !== e.target);
    return { nodes: autosaved.nodes, edges: migratedEdges };
  }
  return { nodes: initialNodes, edges: initialEdges };
};

const initialState = getInitialState();

interface UseWorkflowOptions {
  availableFlows?: Flow[];
  initialGraph?: WorkflowGraph;
  onGraphChange?: (graph: WorkflowGraph) => void;
  projectSettings?: ProjectSettings;
  onUpdateSettings?: (updates: Partial<ProjectSettings>) => void;
}

export function useWorkflow(options: UseWorkflowOptions = {}) {
  const { availableFlows = [], initialGraph, onGraphChange, projectSettings } = options;

  // Store project settings in a ref for use in save logic
  const projectSettingsRef = useRef(projectSettings);
  projectSettingsRef.current = projectSettings;

  // Apply default providers to a graph for DISPLAY purposes
  // These are shown in the UI but stripped when saving
  const applyDefaultProviders = (graph: WorkflowGraph): WorkflowGraph => {
    if (!projectSettings) return graph;

    const updatedNodes = graph.nodes.map(node => {
      // AI LLM nodes - apply default AI settings if not configured
      if (node.type === 'ai_llm') {
        const hasEndpoint = node.data.endpoint && String(node.data.endpoint).trim();
        const hasModel = node.data.model && String(node.data.model).trim();
        const hasProvider = node.data.provider && String(node.data.provider).trim();

        // Only apply defaults if the node doesn't have configured values
        if (!hasEndpoint && !hasModel && !hasProvider) {
          return {
            ...node,
            data: {
              ...node.data,
              endpoint: projectSettings.defaultAIEndpoint || '',
              model: projectSettings.defaultAIModel || '',
              apiKeyConstant: projectSettings.defaultAIApiKeyConstant || '',
              provider: projectSettings.defaultAIProvider || 'openai',
              _hasInheritedDefaults: true, // Mark as having inherited defaults
            },
          };
        }
      }

      // Image Gen nodes - apply default image settings if not configured
      if (node.type === 'image_gen') {
        const hasEndpoint = node.data.endpoint && String(node.data.endpoint).trim();
        const hasProvider = node.data.apiFormat && String(node.data.apiFormat).trim();

        if (!hasEndpoint && !hasProvider) {
          return {
            ...node,
            data: {
              ...node.data,
              endpoint: projectSettings.defaultImageEndpoint || '',
              model: projectSettings.defaultImageModel || '',
              apiKeyConstant: projectSettings.defaultImageApiKeyConstant || '',
              apiFormat: projectSettings.defaultImageProvider || 'openai',
              _hasInheritedDefaults: true,
            },
          };
        }
      }

      // Video Gen nodes - apply default video endpoint if not configured
      if (node.type === 'video_gen') {
        const hasEndpoint = node.data.endpoint && String(node.data.endpoint).trim();

        if (!hasEndpoint) {
          // Use different defaults based on the selected backend
          const isWan2gp = node.data.apiFormat === 'wan2gp';
          const defaultEndpoint = isWan2gp
            ? 'http://127.0.0.1:8773'
            : (projectSettings.defaultVideoEndpoint || 'http://localhost:8188');
          return {
            ...node,
            data: {
              ...node.data,
              endpoint: defaultEndpoint,
              _hasInheritedDefaults: true,
            },
          };
        }
      }

      // ComfyUI Free Memory - apply default ComfyUI URL if not configured
      if (node.type === 'comfyui_free_memory') {
        const hasUrl = node.data.comfyuiUrl && String(node.data.comfyuiUrl).trim();

        if (!hasUrl) {
          return {
            ...node,
            data: {
              ...node.data,
              comfyuiUrl: projectSettings.defaultVideoEndpoint || 'http://127.0.0.1:8188',
              _hasInheritedDefaults: true,
            },
          };
        }
      }

      // Terminal AI Control nodes - apply default AI settings if not configured
      if (node.type === 'terminal_ai_control') {
        const hasEndpoint = node.data.endpoint && String(node.data.endpoint).trim();
        const hasModel = node.data.model && String(node.data.model).trim();
        const hasProvider = node.data.provider && String(node.data.provider).trim();

        // Only apply defaults if the node doesn't have configured values
        if (!hasEndpoint && !hasModel && !hasProvider) {
          return {
            ...node,
            data: {
              ...node.data,
              endpoint: projectSettings.defaultAIEndpoint || '',
              model: projectSettings.defaultAIModel || '',
              apiKeyConstant: projectSettings.defaultAIApiKeyConstant || '',
              provider: projectSettings.defaultAIProvider || 'openai',
              _hasInheritedDefaults: true,
            },
          };
        }
      }

      return node;
    });

    return { ...graph, nodes: updatedNodes };
  };

  // Strip inherited defaults from node data before saving
  // This ensures we only save explicitly set values
  const stripInheritedDefaults = (nodeData: Record<string, unknown>, nodeType: string): Record<string, unknown> => {
    const settings = projectSettingsRef.current;
    if (!settings || !nodeData._hasInheritedDefaults) {
      return nodeData;
    }

    const result = { ...nodeData };
    delete result._hasInheritedDefaults;

    // Strip fields that match project defaults
    if (nodeType === 'ai_llm') {
      if (result.endpoint === settings.defaultAIEndpoint) delete result.endpoint;
      if (result.model === settings.defaultAIModel) delete result.model;
      if (result.apiKeyConstant === settings.defaultAIApiKeyConstant) delete result.apiKeyConstant;
      if (result.provider === settings.defaultAIProvider) delete result.provider;
    } else if (nodeType === 'image_gen') {
      if (result.endpoint === settings.defaultImageEndpoint) delete result.endpoint;
      if (result.model === settings.defaultImageModel) delete result.model;
      if (result.apiKeyConstant === settings.defaultImageApiKeyConstant) delete result.apiKeyConstant;
      if (result.apiFormat === settings.defaultImageProvider) delete result.apiFormat;
    } else if (nodeType === 'video_gen') {
      if (result.endpoint === settings.defaultVideoEndpoint) delete result.endpoint;
    } else if (nodeType === 'comfyui_free_memory') {
      if (result.comfyuiUrl === settings.defaultVideoEndpoint) delete result.comfyuiUrl;
    } else if (nodeType === 'terminal_ai_control') {
      if (result.endpoint === settings.defaultAIEndpoint) delete result.endpoint;
      if (result.model === settings.defaultAIModel) delete result.model;
      if (result.apiKeyConstant === settings.defaultAIApiKeyConstant) delete result.apiKeyConstant;
      if (result.provider === settings.defaultAIProvider) delete result.provider;
    }

    return result;
  };

  // Determine initial state: prefer initialGraph if provided, else fall back to autosave/demo
  const getStartingState = () => {
    if (initialGraph) {
      // If initialGraph is provided (even if empty), use it
      if (initialGraph.nodes.length > 0) {
        // Apply default providers for display
        const graphWithDefaults = applyDefaultProviders(initialGraph);
        // Apply auto-layout for better initial display
        // This won't trigger modifications because we compare against original before calling onGraphChange
        const shouldAutoLayout = graphWithDefaults.edges.length > 0;
        const nodes = graphToReactFlowNodes(graphWithDefaults, shouldAutoLayout);
        const edges = graphToReactFlowEdges(graphWithDefaults);
        // Migrate old handle IDs to new semantic names
        const migratedEdges = migrateEdgeHandles(edges, nodes);
        return { nodes, edges: migratedEdges };
      }
      // Empty graph provided - start with blank canvas
      return { nodes: [], edges: [] };
    }
    // No initialGraph provided - fall back to autosave/demo
    return initialState;
  };

  const startingState = getStartingState();
  const [nodes, setNodes, onNodesChange] = useNodesState(startingState.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(startingState.edges);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Keep availableFlows in a ref for use in callbacks
  const availableFlowsRef = useRef<Flow[]>(availableFlows);
  availableFlowsRef.current = availableFlows;

  // Track streaming logs by node ID
  const streamingLogs = useRef<Map<string, string>>(new Map());

  // Abort controller for stopping workflow execution
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Use ref for isRunning to prevent race conditions
  const isRunningRef = useRef(false);

  // Auto-save to localStorage with debouncing
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Don't save while running (nodes have temporary _status data)
    if (isRunning) return;

    // Clear any pending save
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Helper function to perform the save
    const performSave = () => {
      try {
        // Sensitive fields that should not be persisted to localStorage
        const sensitiveFields = ['apiKey', 'password', 'token', 'secret'];

        // Strip temporary status fields and sensitive fields from node data before saving
        // Allow macro fields (_macro*) and other persistent underscore fields through
        const persistentUnderscoreFields = ['_macroWorkflowId', '_macroName', '_macroInputs', '_macroOutputs', '_collapsed'];
        const cleanNodes = nodes.map((n) => ({
          ...n,
          data: Object.fromEntries(
            Object.entries(n.data).filter(
              ([key]) => {
                // Always strip sensitive fields
                if (sensitiveFields.includes(key)) return false;
                // Allow persistent underscore fields
                if (persistentUnderscoreFields.includes(key)) return true;
                // Strip other underscore-prefixed fields (like _status, _sourceFormat, etc.)
                if (key.startsWith('_')) return false;
                return true;
              }
            )
          ),
        }));

        const toSave = { nodes: cleanNodes, edges };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toSave));
      } catch (error) {
        // Log warning to help debug storage issues (only shown in development)
        workflowLogger.warn(`Autosave failed to save to localStorage: ${error instanceof Error ? error.message : error}`);
      }
    };

    // Schedule save after debounce period
    autosaveTimeoutRef.current = setTimeout(performSave, AUTOSAVE_DEBOUNCE_MS);

    // Cleanup: on unmount or deps change, save immediately to prevent data loss
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        // If component is unmounting, save immediately to prevent data loss
        if (!isMountedRef.current) {
          performSave();
        }
      }
    };
  }, [nodes, edges, isRunning]);

  // Keep onGraphChange in a ref to avoid effect re-runs
  const onGraphChangeRef = useRef(onGraphChange);
  onGraphChangeRef.current = onGraphChange;

  // Fields to ignore when comparing graphs - these are auto-populated defaults
  const defaultProviderFields = new Set([
    'endpoint', 'model', 'apiKeyConstant', 'provider', 'apiFormat', 'comfyuiUrl'
  ]);

  // Normalize a graph for comparison (strip positions, temp fields, and default provider fields)
  const normalizeGraphForComparison = useCallback((graph: WorkflowGraph): string => {
    const normalizedNodes = graph.nodes.map(n => ({
      id: n.id,
      type: n.type,
      data: Object.fromEntries(
        Object.entries(n.data || {}).filter(([key]) =>
          !key.startsWith('_') && !defaultProviderFields.has(key)
        )
      ),
    }));
    normalizedNodes.sort((a, b) => a.id.localeCompare(b.id));

    const normalizedEdges = graph.edges.map(e => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    }));
    normalizedEdges.sort((a, b) => {
      const srcCmp = a.source.localeCompare(b.source);
      if (srcCmp !== 0) return srcCmp;
      return a.target.localeCompare(b.target);
    });

    return JSON.stringify({ nodes: normalizedNodes, edges: normalizedEdges });
  }, []);

  // Store normalized original graph for comparison
  // We use startingState (which has migrations applied) rather than initialGraph
  // This ensures the comparison accounts for edge handle migrations
  const originalGraphRef = useRef<string | null>(null);
  if (originalGraphRef.current === null && startingState.nodes.length > 0) {
    // Convert startingState (React Flow format) back to WorkflowGraph for comparison
    const originalGraph: WorkflowGraph = {
      nodes: startingState.nodes.map(n => ({
        id: n.id,
        type: n.type as NodeType,
        data: n.data || {},
      })),
      edges: startingState.edges.map(e => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      })),
    };
    originalGraphRef.current = normalizeGraphForComparison(originalGraph);
  }

  // Notify parent of graph changes (for project persistence)
  useEffect(() => {
    // Don't notify while running (nodes have temporary _status data)
    if (isRunning || !onGraphChangeRef.current) return;

    // Allow persistent underscore fields through (macro data, collapsed state)
    const persistentUnderscoreFields = ['_macroWorkflowId', '_macroName', '_macroInputs', '_macroOutputs', '_collapsed'];

    // Convert React Flow state back to WorkflowGraph
    const graph: WorkflowGraph = {
      nodes: nodes.map((n) => {
        // First strip inherited defaults (before filtering underscore fields)
        // This ensures auto-applied defaults aren't saved, preventing false modifications
        const strippedData = stripInheritedDefaults(n.data, n.type as string);

        // Then filter out temporary underscore fields
        const cleanedData = Object.fromEntries(
          Object.entries(strippedData).filter(([key]) => {
            // Allow persistent underscore fields
            if (persistentUnderscoreFields.includes(key)) return true;
            // Strip temporary underscore-prefixed fields (like _status)
            if (key.startsWith('_')) return false;
            return true;
          })
        );

        return {
          id: n.id,
          type: n.type as NodeType,
          data: cleanedData,
          position: n.position, // Preserve position for re-loading
        };
      }),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      })),
    };

    // Compare with original - only notify if actually changed
    const currentNormalized = normalizeGraphForComparison(graph);
    if (currentNormalized === originalGraphRef.current) {
      return;
    }

    onGraphChangeRef.current(graph);
  }, [nodes, edges, isRunning, normalizeGraphForComparison]);

  // Add a new node at the center of the viewport
  // Returns the ID of the created node
  const addNode = useCallback((type: NodeType, position?: { x: number; y: number }, extraData?: Record<string, unknown>): string => {
    const id = `${type}-${uuidv4().slice(0, 8)}`;
    const defaultData = getDefaultNodeData(type, projectSettings);
    const finalData = extraData ? { ...defaultData, ...extraData } : defaultData;

    const newNode: Node = {
      id,
      type,
      position: position || { x: 300, y: 200 },
      data: finalData,
    };
    setNodes((nds) => [...nds, newNode]);
    return id;
  }, [setNodes, projectSettings]);

  // Handle edge connection with data propagation
  const onConnect = useCallback((connection: Connection) => {
    // Prevent self-loop connections (node connecting to itself)
    if (connection.source === connection.target) return;

    setEdges((eds) => addEdge({ ...connection, id: `e-${uuidv4().slice(0, 8)}` }, eds));

    // Propagate data from source to target node for certain node type combinations
    if (connection.source && connection.target) {
      const sourceNode = nodes.find(n => n.id === connection.source);
      const targetNode = nodes.find(n => n.id === connection.target);

      if (targetNode?.type === 'text_chunker') {
        // File Read -> Text Chunker: propagate readAs as _sourceFormat and csvHasHeader
        if (sourceNode?.type === 'file_read') {
          const sourceData = sourceNode.data as Record<string, unknown>;
          const readAs = sourceData.readAs as string || 'text';
          const csvHasHeader = sourceData.csvHasHeader !== false; // Default true
          setNodes((nds) =>
            nds.map((node) =>
              node.id === connection.target
                ? { ...node, data: { ...node.data, _sourceFormat: readAs, csvHasHeader: readAs === 'csv' ? csvHasHeader : node.data.csvHasHeader } }
                : node
            )
          );
        }
        // File Input -> Text Chunker: propagate fileName as _fileName
        else if (sourceNode?.type === 'input_file') {
          const fileName = (sourceNode.data as Record<string, unknown>).fileName as string || '';
          if (fileName) {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === connection.target
                  ? { ...node, data: { ...node.data, _fileName: fileName } }
                  : node
              )
            );
          }
        }
      }
    }
  }, [setEdges, nodes, setNodes]);

  // Update node data with propagation to connected nodes
  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) => {
      // First update the target node
      const updatedNodes = nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      );

      // Find the updated node to check its type
      const updatedNode = updatedNodes.find(n => n.id === nodeId);
      if (!updatedNode) return updatedNodes;

      // Propagate changes to connected Text Chunker nodes
      if (updatedNode.type === 'file_read' && ('readAs' in data || 'csvHasHeader' in data)) {
        // Find all Text Chunker nodes connected to this File Read
        const connectedTextChunkers = edges
          .filter(e => e.source === nodeId)
          .map(e => e.target)
          .filter(targetId => updatedNodes.find(n => n.id === targetId)?.type === 'text_chunker');

        if (connectedTextChunkers.length > 0) {
          const fileReadData = updatedNode.data as Record<string, unknown>;
          const readAs = 'readAs' in data ? data.readAs as string : fileReadData.readAs as string || 'text';
          const csvHasHeader = 'csvHasHeader' in data ? data.csvHasHeader as boolean : fileReadData.csvHasHeader !== false;

          return updatedNodes.map(node => {
            if (!connectedTextChunkers.includes(node.id)) return node;

            const updates: Record<string, unknown> = { _sourceFormat: readAs };
            // Only propagate csvHasHeader when in CSV mode
            if (readAs === 'csv') {
              updates.csvHasHeader = csvHasHeader;
            }
            return { ...node, data: { ...node.data, ...updates } };
          });
        }
      }

      // Propagate fileName from File Input to connected Text Chunker
      if (updatedNode.type === 'input_file' && 'fileName' in data) {
        const connectedTextChunkers = edges
          .filter(e => e.source === nodeId)
          .map(e => e.target)
          .filter(targetId => updatedNodes.find(n => n.id === targetId)?.type === 'text_chunker');

        if (connectedTextChunkers.length > 0) {
          return updatedNodes.map(node =>
            connectedTextChunkers.includes(node.id)
              ? { ...node, data: { ...node.data, _fileName: data.fileName as string } }
              : node
          );
        }
      }

      return updatedNodes;
    });
  }, [setNodes, edges]);

  // Wrap onEdgesChange to handle edge removal and clear propagated data
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // Check for edge removals
    const removals = changes.filter(change => change.type === 'remove');

    if (removals.length > 0) {
      // Find edges being removed to check if they connected to Text Chunker
      const removedEdgeIds = removals.map(r => r.id);
      const removedEdges = edges.filter(e => removedEdgeIds.includes(e.id));

      // Find Text Chunker nodes that are losing their source connections
      const textChunkersToClear: string[] = [];

      for (const edge of removedEdges) {
        const targetNode = nodes.find(n => n.id === edge.target);
        const sourceNode = nodes.find(n => n.id === edge.source);

        if (targetNode?.type === 'text_chunker') {
          // Check if this was from a File Read or File Input
          if (sourceNode?.type === 'file_read' || sourceNode?.type === 'input_file') {
            textChunkersToClear.push(edge.target);
          }
        }
      }

      // Clear appropriate data from disconnected Text Chunker nodes
      if (textChunkersToClear.length > 0) {
        // Track what to clear per Text Chunker
        const clearMap = new Map<string, { clearSourceFormat: boolean; clearFileName: boolean }>();

        for (const edge of removedEdges) {
          const targetNode = nodes.find(n => n.id === edge.target);
          const sourceNode = nodes.find(n => n.id === edge.source);

          if (targetNode?.type === 'text_chunker') {
            const existing = clearMap.get(edge.target) || { clearSourceFormat: false, clearFileName: false };
            if (sourceNode?.type === 'file_read') {
              existing.clearSourceFormat = true;
            } else if (sourceNode?.type === 'input_file') {
              existing.clearFileName = true;
            }
            clearMap.set(edge.target, existing);
          }
        }

        setNodes((nds) =>
          nds.map((node) => {
            const clearInfo = clearMap.get(node.id);
            if (!clearInfo) return node;

            const newData = { ...node.data };
            if (clearInfo.clearSourceFormat) {
              newData._sourceFormat = undefined;
            }
            if (clearInfo.clearFileName) {
              newData._fileName = undefined;
            }
            return { ...node, data: newData };
          })
        );
      }
    }

    // Call the base handler
    onEdgesChangeBase(changes);
  }, [onEdgesChangeBase, edges, nodes, setNodes]);

  // Add log entry
  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newEntry: LogEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: Date.now(),
    };
    setLogs((prev) => [...prev, newEntry]);
  }, []);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    streamingLogs.current.clear();
  }, []);

  // Buffer for streaming tokens to prevent UI freezing on high-speed streams
  // Tokens are accumulated and flushed to React state at a throttled rate
  const tokenBufferRef = useRef<Map<string, string>>(new Map());
  const flushTimeoutRef = useRef<number | null>(null);

  // Clean up flushTimeoutRef on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle streaming tokens from AI with buffering to prevent UI freezing
  // For fast LLMs (like Groq), tokens can arrive hundreds of times per second
  // Without buffering, this would cause massive React re-renders
  const handleStreamToken = useCallback((nodeId: string, token: string) => {
    // 1. Update the "source of truth" (streamingLogs) immediately
    const existing = streamingLogs.current.get(nodeId) || '';
    const updated = existing + token;
    streamingLogs.current.set(nodeId, updated);

    // 2. Buffer the update for the UI (store the FULL updated string for consistency)
    tokenBufferRef.current.set(nodeId, updated);

    // 3. Schedule a flush if not already scheduled (throttle to max 10 updates/sec)
    if (!flushTimeoutRef.current) {
      flushTimeoutRef.current = window.setTimeout(() => {
        // FLUSH: Update React State in one batch
        setLogs((prev) => {
          const newLogs = [...prev];

          // Iterate over all buffered updates
          tokenBufferRef.current.forEach((content, buffNodeId) => {
            const existingIndex = newLogs.findIndex(
              (log) => log.source === buffNodeId && log.isStreaming
            );

            if (existingIndex >= 0) {
              // Update existing streaming log
              newLogs[existingIndex] = {
                ...newLogs[existingIndex],
                message: content,
              };
            } else {
              // Create new streaming log
              newLogs.push({
                id: uuidv4(),
                source: buffNodeId,
                message: content,
                timestamp: Date.now(),
                isStreaming: true,
                type: 'node' as const,
              });
            }
          });

          return newLogs;
        });

        // Clear buffer and timeout after flush
        tokenBufferRef.current.clear();
        flushTimeoutRef.current = null;
      }, 100); // 100ms throttle = max 10 UI updates per second
    }
  }, []);

  // Handle real-time image updates from runtime
  const handleImageUpdate = useCallback((nodeId: string, imageUrl: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, imageUrl } } : node
      )
    );
  }, [setNodes]);

  // Handle node execution status updates (running/completed/error)
  const handleNodeStatus = useCallback((nodeId: string, status: 'running' | 'completed' | 'error') => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, _status: status } } : node
      )
    );
  }, [setNodes]);

  // Validate workflow before execution
  const validateWorkflow = useCallback((): string[] => {
    return validateWorkflowUtil(nodes, edges);
  }, [nodes, edges]);

  // Run the workflow
  const runWorkflow = useCallback(async () => {
    // Use ref to prevent race condition (double-click or rapid calls)
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    // Validate before running
    const validationErrors = validateWorkflow();
    if (validationErrors.length > 0) {
      validationErrors.forEach((err) => {
        addLog({
          source: 'Validation',
          message: err,
          type: 'error',
        });
      });
      isRunningRef.current = false;
      return;
    }

    setIsRunning(true);
    streamingLogs.current.clear();

    // Create new abort controller for this run
    abortControllerRef.current = new AbortController();

    // Clear previous output values, image previews, and status from all nodes
    setNodes((nds) =>
      nds.map((node) => {
        const clearedData = { ...node.data, _status: undefined };
        if (node.type === 'output') {
          return { ...node, data: { ...clearedData, outputValue: undefined } };
        }
        if (node.type === 'image_gen' || node.type === 'image_save' || node.type === 'image_view') {
          return { ...node, data: { ...clearedData, imageUrl: undefined } };
        }
        if (node.type === 'video_gen' || node.type === 'video_save') {
          return { ...node, data: { ...clearedData, videoUrl: undefined } };
        }
        return { ...node, data: clearedData };
      })
    );

    // Convert React Flow state to WorkflowGraph
    const graph: WorkflowGraph = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as NodeType,
        data: n.data as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      })),
    };

    // Database callback for the runtime - JSON collection storage
    const handleDatabaseOperation = async (request: DatabaseRequest): Promise<DatabaseResult> => {
      try {
        const { operation, collectionName, data, filter } = request;
        const collection = collectionName || 'workflow_data';

        switch (operation) {
          case 'insert': {
            // Store data to collection
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
        workflowLogger.error(`Database operation failed: ${errorMsg}`, error);
        return { success: false, error: errorMsg || 'Unknown error' };
      }
    };

    // Create runtime with callbacks and abort signal
    // Note: Local network permission handling is now done via JobQueueContext
    const runtime = createRuntime(
      handleStreamToken,
      (entry) => addLog(entry),
      handleImageUpdate,
      handleNodeStatus,
      abortControllerRef.current.signal,
      handleDatabaseOperation,
      undefined // Network permission handled at provider level
    );

    // Set project settings for local network whitelist checking
    if (projectSettings) {
      runtime.setProjectSettings(projectSettings);
    }

    // Connect module loader for dynamic node support
    const moduleLoader = getModuleLoader();
    runtime.setModuleRegistry(moduleLoader);

    // Register all module runtimes with the FormLogic engine
    for (const loadedModule of moduleLoader.getAllModules()) {
      if (loadedModule.runtime) {
        await runtime.registerDynamicModule(loadedModule);
      }
    }

    try {
      const result = await runtime.runWorkflow(graph, availableFlowsRef.current);

      // Extract the final output value from FormLogic BaseObject
      // The result is workflow_context which is a HashObject - we want the "final" key
      let outputValue: string | string[] = '';
      let nodeOutputs: Record<string, string | string[]> = {};

      if (result && typeof result === 'object') {
        // Use type guards to safely extract values
        const extracted = extractNodeOutputs(result);
        nodeOutputs = extracted.outputs;
        outputValue = extracted.finalValue;

        // Fallback: use inspect() if entries not available or no final value found
        if (!outputValue && typeof result === "object") {
          const fullOutput = JSON.stringify(result);

          // Check if the final value looks like an array: [item1, item2, ...]
          const arrayMatch = fullOutput.match(/final:\s*\[([\s\S]*?)\]/);
          if (arrayMatch) {
            // Parse the array contents - split by comma but be careful with URLs
            const arrayContent = arrayMatch[1];
            // Split on ", " but not on commas inside URLs (which have no space after)
            const items = arrayContent.split(/,\s+/).map((s: string) => s.trim()).filter((s: string) => s);
            if (items.length > 0) {
              outputValue = items;
            }
          } else {
            // Try to parse as single value
            const finalMatch = fullOutput.match(/final:\s*([\s\S]*?)(?:,\s*[a-zA-Z_-]+:|}\s*$)/);
            if (finalMatch) {
              outputValue = finalMatch[1].trim();
            } else {
              outputValue = fullOutput;
            }
          }
        }
      } else if (result !== null && result !== undefined) {
        outputValue = String(result);
      }

      // Update output nodes and image_view nodes with results
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === 'output') {
            // Find the input to this output node by tracing edges
            const incomingEdge = edges.find(e => e.target === node.id);
            if (incomingEdge) {
              // Look up the value of the source node (the node connected to this output)
              const sourceNodeValue = nodeOutputs[incomingEdge.source];
              if (sourceNodeValue !== undefined) {
                // Use 'outputValue' field which core-flow-control OutputNode component reads
                return { ...node, data: { ...node.data, outputValue: sourceNodeValue } };
              }
              // Fallback to the final output value if source not found
              const displayValue = Array.isArray(outputValue)
                ? outputValue
                : (outputValue || 'Workflow completed');
              return { ...node, data: { ...node.data, outputValue: displayValue } };
            }
          } else if (node.type === 'image_view' || node.type === 'image_save') {
            // Update image_view and image_save nodes with the image URL from their input
            const nodeValue = nodeOutputs[node.id];
            if (nodeValue) {
              const singleValue = Array.isArray(nodeValue) ? nodeValue[0] : nodeValue;
              if (singleValue && singleValue.startsWith('http')) {
                return { ...node, data: { ...node.data, imageUrl: singleValue } };
              }
            }
          } else if (node.type === 'video_save') {
            // Update video_save nodes with the result (either from node's own output or connected input)
            workflowLogger.debug(`video_save node.id: ${node.id}`);
            workflowLogger.debug(`video_save nodeOutputs keys: ${Object.keys(nodeOutputs).join(', ')}`);

            // First check if this node produced its own output
            const nodeValue = nodeOutputs[node.id];
            workflowLogger.debug(`video_save nodeValue for ${node.id}: ${nodeValue}`);
            if (nodeValue) {
              const singleValue = Array.isArray(nodeValue) ? nodeValue[0] : nodeValue;
              if (singleValue) {
                // Accept URLs, data URLs, and local file paths
                workflowLogger.debug(`video_save Setting outputValue: ${singleValue}`);
                return { ...node, data: { ...node.data, outputValue: singleValue } };
              }
            }
            // Fallback: check connected input
            const incomingEdge = edges.find(e => e.target === node.id);
            if (incomingEdge) {
              const sourceValue = nodeOutputs[incomingEdge.source];
              if (sourceValue) {
                const singleValue = Array.isArray(sourceValue) ? sourceValue[0] : sourceValue;
                if (singleValue) {
                  // Accept URLs, data URLs, and local file paths
                  return { ...node, data: { ...node.data, outputValue: singleValue } };
                }
              }
            }
          }
          return node;
        })
      );

      // Mark all streaming logs as complete
      setLogs((prev) =>
        prev.map((log) => ({ ...log, isStreaming: false }))
      );

      // Add output to log with special formatting
      if (outputValue) {
        // Helper to truncate base64 data URLs for cleaner log output
        const truncateBase64 = (str: string): string => {
          return str.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g,
            (match) => match.substring(0, 50) + '...[base64 truncated]');
        };

        const logMessage = Array.isArray(outputValue)
          ? truncateBase64(JSON.stringify(outputValue, null, 2))
          : truncateBase64(String(outputValue));
        addLog({
          source: 'Output',
          message: logMessage,
          type: 'success',
        });
      }
    } catch (error) {
      // Check if this was an abort (either from AbortController, our loop abort check, or __ABORT__ sentinel)
      const errorStr = error instanceof Error ? error.message : String(error);
      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        errorStr.includes('__ABORT__') ||
        errorStr === 'Workflow aborted' ||
        errorStr.includes('aborted');
      if (isAbort) {
        addLog({
          source: 'System',
          message: 'Workflow stopped by user',
          type: 'info',
        });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        addLog({
          source: 'System',
          message: `Error: ${message}`,
          type: 'error',
        });
      }
    } finally {
      abortControllerRef.current = null;
      isRunningRef.current = false;

      // Only update state if still mounted
      if (isMountedRef.current) {
        setIsRunning(false);
        // Clear any running status from nodes
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            data: { ...node.data, _status: undefined },
          }))
        );
      }
    }
  }, [nodes, edges, addLog, handleStreamToken, handleImageUpdate, handleNodeStatus, setNodes, validateWorkflow, projectSettings]);

  // Stop the running workflow
  const stopWorkflow = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog({
        source: 'System',
        message: 'Stopping workflow...',
        type: 'info',
      });
    }
  }, [addLog]);

  // Delete selected nodes and their connected edges
  const deleteSelected = useCallback(() => {
    setNodes((nds) => {
      const selectedNodeIds = new Set(nds.filter((n) => n.selected).map((n) => n.id));

      // Also remove edges connected to deleted nodes
      setEdges((eds) => eds.filter((e) =>
        !e.selected &&
        !selectedNodeIds.has(e.source) &&
        !selectedNodeIds.has(e.target)
      ));

      return nds.filter((n) => !n.selected);
    });
  }, [setNodes, setEdges]);

  // Clipboard operations (copy/paste nodes and edges)
  const { copySelected, hasClipboard, getClipboardData, pasteClipboard } = useClipboard({
    nodes,
    edges,
    setNodes,
    setEdges,
    addLog,
  });

  // Save workflow to JSON file
  const saveWorkflow = useCallback(() => {
    const workflow = prepareWorkflowForExport(nodes, edges);

    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zipp-workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    addLog({
      source: 'System',
      message: 'Workflow saved successfully',
      type: 'success',
    });
  }, [nodes, edges, addLog]);

  // Load workflow from JSON file
  const loadWorkflow = useCallback((file: File) => {
    // Capture mount state at start to avoid stale closure issues
    if (!isMountedRef.current) return;

    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      // Early exit if unmounted during async read
      if (!isMountedRef.current) return;

      try {
        const content = e.target?.result as string;
        const parsed = parseWorkflowJson(content);
        const { nodes: loadedNodes, edges: loadedEdges } = workflowToReactFlow(parsed);

        if (isMountedRef.current) {
          // Batch node and edge updates to prevent flicker during flow loading
          flushSync(() => {
            setNodes(loadedNodes);
            setEdges(loadedEdges);
          });
          clearLogs();
          setIsLoading(false);

          addLog({
            source: 'System',
            message: `Workflow loaded: ${parsed.name || 'Untitled'} (${loadedNodes.length} nodes, ${loadedEdges.length} edges)`,
            type: 'success',
          });
        }
      } catch (error) {
        if (isMountedRef.current) {
          setIsLoading(false);
          const message = error instanceof Error ? error.message : 'Unknown error';
          addLog({
            source: 'System',
            message: `Failed to load workflow: ${message}`,
            type: 'error',
          });
        }
      }
    };
    reader.onerror = () => {
      if (isMountedRef.current) {
        setIsLoading(false);
        addLog({
          source: 'System',
          message: `Failed to read file: ${reader.error?.message || 'Unknown read error'}`,
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  }, [setNodes, setEdges, clearLogs, addLog]);

  // Clear workflow (new)
  const newWorkflow = useCallback(() => {
    // Batch node and edge updates to prevent flicker
    flushSync(() => {
      setNodes([]);
      setEdges([]);
    });
    clearLogs();
    // Clear autosave so we start fresh next time
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // Silent failure for localStorage operations
    }
    addLog({
      source: 'System',
      message: 'New workflow created',
      type: 'info',
    });
  }, [setNodes, setEdges, clearLogs, addLog]);

  // Auto-layout nodes using dagre
  const autoLayout = useCallback((direction: 'LR' | 'TB' = 'LR') => {
    if (nodes.length === 0) return;

    const layoutedNodes = applyAutoLayout(nodes, edges, direction);
    setNodes(layoutedNodes);
    addLog({
      source: 'System',
      message: `Auto-layout applied (${direction === 'LR' ? 'horizontal' : 'vertical'})`,
      type: 'info',
    });
  }, [nodes, edges, setNodes, addLog]);

  // Load a graph directly (used by AI Flow Designer)
  const loadGraph = useCallback((graph: WorkflowGraph, applyLayout = true) => {
    const newNodes = graphToReactFlowNodes(graph, applyLayout);
    const newEdges = graphToReactFlowEdges(graph);
    // Migrate old handle IDs to new semantic names (for backward compatibility)
    const migratedEdges = migrateEdgeHandles(newEdges, newNodes);
    setNodes(newNodes);
    setEdges(migratedEdges);
    addLog({
      source: 'System',
      message: `Workflow loaded: ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
      type: 'success',
    });
  }, [setNodes, setEdges, addLog]);

  // Get current workflow graph (for job queue submission)
  const getWorkflowGraph = useCallback((): WorkflowGraph => {
    return reactFlowToWorkflowGraph(nodes, edges);
  }, [nodes, edges]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    logs,
    isRunning,
    isLoading,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNodeData,
    runWorkflow,
    stopWorkflow,
    clearLogs,
    deleteSelected,
    copySelected,
    pasteClipboard,
    hasClipboard,
    getClipboardData,
    saveWorkflow,
    loadWorkflow,
    loadGraph,
    newWorkflow,
    autoLayout,
    getWorkflowGraph,
  };
}

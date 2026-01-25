import { useState, useCallback, useEffect, useRef } from 'react';
import ZippBuilder from './ZippBuilder';
import FlowsSidebar from './panels/FlowsSidebar';
import { createLogger } from '../utils/logger';

const logger = createLogger('ZippApp');
import DataViewer from './panels/DataViewer';
import SettingsPanel from './panels/SettingsPanel';
import QueuePanel from './panels/QueuePanel';
import ConfirmDialog from './ui/ConfirmDialog';
import MacroRunnerModal from './ui/MacroRunnerModal';
import { useProject } from '../hooks/useProject';
import { useToast } from './Toast';
import { usePackageWatcher } from '../hooks/usePackageWatcher';
import { usePackageNodes } from '../hooks/usePackageNodes';
import { usePackageManager, type LoadedPackage, type ActivePackageFlow } from '../hooks/usePackageManager';
import { JobQueueProvider, useJobQueue } from '../contexts/JobQueueContext';
import type { WorkflowGraph, Flow, LocalNetworkPermissionRequest, LocalNetworkPermissionResponse } from 'zipp-core';
import LocalNetworkPermissionDialog from './dialogs/LocalNetworkPermissionDialog';
import { TrustDialog, DependencyDialog, PackageBrowser } from './PackageManager';

type MainTab = 'builder' | 'data';

// Re-export types for backward compatibility
export type { LoadedPackage, ActivePackageFlow };

// Connected FlowsSidebar that accesses JobQueue context
interface ConnectedFlowsSidebarProps extends Omit<React.ComponentProps<typeof FlowsSidebar>, 'isFlowRunning'> {
  flows: Flow[];
}

function ConnectedFlowsSidebar(props: ConnectedFlowsSidebarProps) {
  const { isFlowRunning } = useJobQueue();

  return <FlowsSidebar {...props} isFlowRunning={isFlowRunning} />;
}

export default function ZippApp() {
  const {
    project,
    activeFlow,
    activeFlowId,
    setActiveFlowId,
    resetCounter,
    createFlow,
    updateFlow,
    deleteFlow,
    duplicateFlow,
    renameFlow,
    setFlowLocalOnly,
    updateFlowGraph,
    getAllFlows,
    exportProject,
    newProject,
    renameProject,
    updateSettings,
    getSettings,
    updateConstant,
    createConstant,
    incrementResetCounter,
    saveAsMacro,
    hasMacroBeenModified,
    saveMacroChanges,
    revertMacroToOriginal,
    reloadMacros,
  } = useProject();

  const { addToast } = useToast();

  // Package nodes management
  const {
    loadPackageNodes,
    unloadPackageNodes,
    getAllPackageNodes,
    loadEmbeddedContent,
    unloadEmbeddedContent,
  } = usePackageNodes();

  const [flowsSidebarOpen, setFlowsSidebarOpen] = useState(true);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const [editingFlowName, setEditingFlowName] = useState(false);
  const [flowNameValue, setFlowNameValue] = useState('');
  const flowNameInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('builder');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  // Package management hook
  const {
    loadedPackages,
    activePackageFlow,
    activePackage,
    activePackageFlowData,
    activePackageMacros,
    pendingPackage,
    pendingDependencies,
    changedPackage,
    showPackageBrowser,
    setActivePackageFlow,
    setPendingPackage,
    setPendingDependencies,
    setShowPackageBrowser,
    clearChangedPackage,
    handleLoadPackage,
    handleLoadPackageFromPath,
    handlePackageTrustConfirm,
    handleDependencyLoaded,
    handleDependenciesSatisfied,
    handleContinueWithoutDeps,
    handleClosePackage,
    handleReloadPackage,
    handleSelectPackageFlow,
    handlePackageChanged,
  } = usePackageManager({
    projectFlows: project.flows,
    projectSettings: project.settings,
    onShowToast: addToast,
    setActiveFlowId,
    createFlow,
    updateFlow,
    getSettings,
    loadPackageNodes,
    unloadPackageNodes,
    loadEmbeddedContent,
    unloadEmbeddedContent,
  });

  // Macro runner modal state
  const [macroRunnerFlow, setMacroRunnerFlow] = useState<Flow | null>(null);

  // Local network permission dialog state
  const [permissionRequest, setPermissionRequest] = useState<LocalNetworkPermissionRequest | null>(null);
  const permissionResolverRef = useRef<((response: LocalNetworkPermissionResponse) => void) | null>(null);

  // Handle local network permission requests
  const handleLocalNetworkPermission = useCallback((request: LocalNetworkPermissionRequest): Promise<LocalNetworkPermissionResponse> => {
    return new Promise((resolve) => {
      permissionResolverRef.current = resolve;
      setPermissionRequest(request);
    });
  }, []);

  // Handle permission dialog response
  const handlePermissionResponse = useCallback((allowed: boolean, remember: boolean) => {
    if (permissionResolverRef.current) {
      permissionResolverRef.current({ allowed, remember });
      permissionResolverRef.current = null;
    }
    setPermissionRequest(null);
  }, []);

  // Handle flow name editing
  const startEditingFlowName = useCallback(() => {
    if (activeFlow) {
      setFlowNameValue(activeFlow.name);
      setEditingFlowName(true);
      setTimeout(() => flowNameInputRef.current?.select(), 0);
    }
  }, [activeFlow]);

  const finishEditingFlowName = useCallback(() => {
    if (activeFlowId && flowNameValue.trim()) {
      renameFlow(activeFlowId, flowNameValue.trim());
    }
    setEditingFlowName(false);
  }, [activeFlowId, flowNameValue, renameFlow]);

  // Debounce ref for macro auto-save
  const macroAutoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MACRO_AUTOSAVE_DEBOUNCE_MS = 2000;
  // Flag to skip auto-save during revert/load operations
  const skipAutoSaveRef = useRef(false);

  // Handle flow graph updates from the builder
  const handleGraphChange = useCallback((graph: WorkflowGraph) => {
    if (activeFlowId) {
      updateFlowGraph(activeFlowId, graph);

      // Auto-save macros with debounce (unless we're in a skip state)
      const flow = project.flows.find(f => f.id === activeFlowId);
      if (flow?.isMacro && !skipAutoSaveRef.current) {
        // Clear pending auto-save
        if (macroAutoSaveRef.current) {
          clearTimeout(macroAutoSaveRef.current);
        }
        // Schedule new auto-save
        macroAutoSaveRef.current = setTimeout(async () => {
          await saveMacroChanges(activeFlowId);
          logger.debug(`Auto-saved macro "${flow.name}"`);
        }, MACRO_AUTOSAVE_DEBOUNCE_MS);
      }
    }
  }, [activeFlowId, updateFlowGraph, project.flows, saveMacroChanges]);

  // Handle creating a new flow
  const handleCreateFlow = useCallback((name: string) => {
    createFlow(name);
  }, [createFlow]);

  // Handle creating a flow for the agent (with proper state sync)
  const handleCreateFlowForAgent = useCallback(async (name: string, graph: WorkflowGraph): Promise<{ flowId: string }> => {
    const newFlow = createFlow(name, graph);
    setActiveFlowId(newFlow.id);
    return { flowId: newFlow.id };
  }, [createFlow, setActiveFlowId]);

  // Handle saving a flow as a macro
  const handleSaveAsMacro = useCallback((flowId: string) => {
    const result = saveAsMacro(flowId);
    if (result.success) {
      addToast(result.message, 'success');
    } else {
      addToast(result.message, 'error');
    }
  }, [saveAsMacro, addToast]);

  // Clean up macro auto-save timeout on unmount or when flow changes
  useEffect(() => {
    return () => {
      if (macroAutoSaveRef.current) {
        clearTimeout(macroAutoSaveRef.current);
      }
    };
  }, [activeFlowId]);

  // Handle editing a macro (navigate to it - all macros are now editable)
  const handleEditMacro = useCallback((flowId: string) => {
    setActiveFlowId(flowId);
    // No toast needed - auto-save is silent
  }, [setActiveFlowId]);

  // Handle saving macro changes (called when editing a macro)
  const handleSaveMacroChanges = useCallback(async (flowId: string) => {
    const saved = await saveMacroChanges(flowId);
    if (saved) {
      addToast('Macro changes saved', 'success');
    } else {
      addToast('Failed to save macro changes', 'error');
    }
  }, [saveMacroChanges, addToast]);

  // Handle reverting a macro to its original built-in version
  const handleRevertMacro = useCallback(async (flowId: string) => {
    // Clear any pending auto-save
    if (macroAutoSaveRef.current) {
      clearTimeout(macroAutoSaveRef.current);
      macroAutoSaveRef.current = null;
    }

    // Skip auto-save during revert to prevent re-saving the reverted state
    skipAutoSaveRef.current = true;

    const reverted = await revertMacroToOriginal(flowId);
    if (reverted) {
      // Force ZippBuilder to reload with the reverted graph
      incrementResetCounter();
      addToast('Macro reverted to original version', 'success');
    } else {
      addToast('Failed to revert macro', 'error');
    }

    // Re-enable auto-save after a delay (enough for the graph to reload)
    setTimeout(() => {
      skipAutoSaveRef.current = false;
    }, 500);
  }, [revertMacroToOriginal, incrementResetCounter, addToast]);

  // Watch for package file changes
  usePackageWatcher({
    loadedPackages,
    checkInterval: 3000, // Check every 3 seconds
    onPackageChanged: handlePackageChanged,
  });

  // Handle selecting a user flow (clears package flow selection)
  const handleSelectUserFlow = useCallback(async (flowId: string) => {
    // Update UI immediately for instant feedback
    skipAutoSaveRef.current = true;
    setActiveFlowId(flowId);
    setActivePackageFlow(null); // Clear package flow selection

    // If switching away from a macro, save any pending changes in the background
    if (activeFlowId && activeFlowId !== flowId) {
      const currentFlow = project.flows.find(f => f.id === activeFlowId);
      if (currentFlow?.isMacro) {
        // Clear any pending auto-save
        if (macroAutoSaveRef.current) {
          clearTimeout(macroAutoSaveRef.current);
          macroAutoSaveRef.current = null;
        }
        // Save in background (don't await - UI already updated)
        saveMacroChanges(activeFlowId);
      }
    }

    // Re-enable auto-save after initial graph load
    setTimeout(() => {
      skipAutoSaveRef.current = false;
    }, 500);
  }, [activeFlowId, project.flows, saveMacroChanges, setActiveFlowId, setActivePackageFlow]);

  // Debug logging for flow display issues
  if (activePackageFlow) {
    logger.debug('Active package flow state', {
      packageId: activePackageFlow.packageId,
      flowId: activePackageFlow.flowId,
      packageFound: !!activePackage,
      packageFlowCount: activePackage?.flows.length,
      flowDataFound: !!activePackageFlowData,
      flowIds: activePackage?.flows.map(f => f.id),
      flowHasGraph: !!activePackageFlowData?.graph,
      flowGraphNodeCount: activePackageFlowData?.graph?.nodes?.length,
      flowGraphEdgeCount: activePackageFlowData?.graph?.edges?.length,
    });
  }
  // Provider to request format mapping
  const getRequestFormatForProvider = (provider: string): string => {
    if (provider === 'anthropic') return 'anthropic';
    return 'openai';
  };

  // Apply default settings to all AI/LLM and ImageGen nodes in ALL flows
  const handleApplyDefaultsToAllNodes = useCallback(() => {
    const allFlows = getAllFlows();
    if (allFlows.length === 0) return;

    const settings = getSettings();
    let totalAiNodeCount = 0;
    let totalImageNodeCount = 0;
    let flowsUpdated = 0;

    // Update each flow
    allFlows.forEach(flow => {
      let aiNodeCount = 0;
      let imageNodeCount = 0;

      const updatedNodes = flow.graph.nodes.map(node => {
        if (node.type === 'ai_llm') {
          aiNodeCount++;
          return {
            ...node,
            data: {
              ...node.data,
              provider: settings.defaultAIProvider || 'openai',
              endpoint: settings.defaultAIEndpoint || '',
              model: settings.defaultAIModel || '',
              requestFormat: getRequestFormatForProvider(settings.defaultAIProvider || 'openai'),
              apiKeyConstant: settings.defaultAIApiKeyConstant || '',
            },
          };
        }
        if (node.type === 'image_gen') {
          imageNodeCount++;
          return {
            ...node,
            data: {
              ...node.data,
              apiFormat: settings.defaultImageProvider || 'openai',
              endpoint: settings.defaultImageEndpoint || '',
              model: settings.defaultImageModel || '',
              apiKeyConstant: settings.defaultImageApiKeyConstant || '',
            },
          };
        }
        return node;
      });

      // Only update if we changed any nodes
      if (aiNodeCount > 0 || imageNodeCount > 0) {
        updateFlowGraph(flow.id, {
          ...flow.graph,
          nodes: updatedNodes,
        });
        flowsUpdated++;
        totalAiNodeCount += aiNodeCount;
        totalImageNodeCount += imageNodeCount;
      }
    });

    // Refresh the canvas to show updated values
    incrementResetCounter();

    // Show toast notification
    const totalNodes = totalAiNodeCount + totalImageNodeCount;
    if (totalNodes > 0) {
      addToast(`Applied defaults to ${totalNodes} node${totalNodes !== 1 ? 's' : ''} across ${flowsUpdated} flow${flowsUpdated !== 1 ? 's' : ''} (${totalAiNodeCount} AI, ${totalImageNodeCount} Image)`, 'success');
    } else {
      addToast('No AI/LLM or Image Gen nodes found in any flow', 'info');
    }

    return { totalAiNodeCount, totalImageNodeCount, flowsUpdated };
  }, [getAllFlows, getSettings, updateFlowGraph, incrementResetCounter, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save project
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        exportProject();
        addToast(`Project "${project.name}" saved to Downloads`, 'success');
      }
      // Ctrl/Cmd + N for new project
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowNewProjectDialog(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exportProject, newProject, project.name, addToast]);

  return (
    <JobQueueProvider
      availableFlows={getAllFlows()}
      packageMacros={activePackageMacros}
      projectSettings={project.settings}
      onLocalNetworkPermission={handleLocalNetworkPermission}
      onUpdateSettings={updateSettings}
      onCreateFlow={createFlow}
      onDeleteFlow={deleteFlow}
      onUpdateFlow={updateFlow}
      onUpdateFlowGraph={updateFlowGraph}
      onReloadMacros={reloadMacros}
    >
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: 'rgb(var(--bg-primary))' }}>
      {/* Flows Sidebar - always visible for consistency */}
      <ConnectedFlowsSidebar
        flows={project.flows}
        activeFlowId={activePackageFlow ? null : activeFlowId}
        onSelectFlow={handleSelectUserFlow}
        onCreateFlow={handleCreateFlow}
        onDeleteFlow={deleteFlow}
        onDuplicateFlow={duplicateFlow}
        onRenameFlow={renameFlow}
        onSetFlowLocalOnly={setFlowLocalOnly}
        onSaveAsMacro={handleSaveAsMacro}
        onEditMacro={handleEditMacro}
        onSaveMacro={handleSaveMacroChanges}
        onRevertMacro={handleRevertMacro}
        hasMacroBeenModified={hasMacroBeenModified}
        isOpen={flowsSidebarOpen}
        onClose={() => setFlowsSidebarOpen(false)}
        loadedPackages={loadedPackages}
        activePackageFlow={activePackageFlow}
        onSelectPackageFlow={handleSelectPackageFlow}
        onClosePackage={handleClosePackage}
        onLoadPackage={handleLoadPackage}
        onOpenBrowser={() => setShowPackageBrowser(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Project Header */}
        <div className="h-12 bg-white/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-2 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            {/* Toggle Flows Sidebar Button */}
            <button
              onClick={() => setFlowsSidebarOpen(!flowsSidebarOpen)}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex-shrink-0"
              aria-label="Toggle flows sidebar"
            >
              <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>

            {/* Main Tabs */}
            <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setActiveTab('builder')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === 'builder'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className="hidden sm:inline">Workflow </span>Builder
              </button>
              <button
                onClick={() => setActiveTab('data')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === 'data'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className="hidden sm:inline">Data </span>Viewer
              </button>
            </div>

            {/* Project Name / Flow Name - only show on builder tab */}
            {activeTab === 'builder' && (
              <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
                {activePackageFlowData && activePackage ? (
                  // Package flow view - show package name and flow name
                  <>
                    <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-purple-900/30 rounded border border-purple-500/30">
                      <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <span className="text-purple-200 font-medium text-sm truncate max-w-[100px]">
                        {activePackage.manifest.name}
                      </span>
                    </div>
                    <span className="hidden sm:inline text-slate-400 dark:text-slate-600">/</span>
                    <span className="text-purple-600 dark:text-purple-300 text-sm truncate max-w-[120px] sm:max-w-[150px] md:max-w-[200px]">
                      {activePackageFlowData.name}
                    </span>
                  </>
                ) : (
                  // User flow view - show project name and flow name
                  <>
                    <input
                      type="text"
                      value={project.name}
                      onChange={(e) => renameProject(e.target.value)}
                      className="hidden sm:block bg-transparent text-slate-700 dark:text-slate-200 font-medium text-sm border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 max-w-[120px] md:max-w-[200px]"
                    />
                    {activeFlow && (
                      <>
                        <span className="hidden sm:inline text-slate-400 dark:text-slate-600">/</span>
                        {editingFlowName ? (
                          <input
                            ref={flowNameInputRef}
                            type="text"
                            value={flowNameValue}
                            onChange={(e) => setFlowNameValue(e.target.value)}
                            onBlur={finishEditingFlowName}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') finishEditingFlowName();
                              if (e.key === 'Escape') setEditingFlowName(false);
                            }}
                            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm border border-blue-500 rounded px-2 py-0.5 focus:outline-none min-w-[80px] max-w-[150px]"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={startEditingFlowName}
                            className="text-slate-600 dark:text-slate-300 text-sm hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 px-1 py-0.5 rounded truncate max-w-[120px] sm:max-w-[150px] md:max-w-[200px]"
                            title="Click to rename flow"
                          >
                            {activeFlow.name}
                          </button>
                        )}
                        {activeFlow.localOnly && (
                          <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 bg-green-600/30 text-green-400 rounded flex-shrink-0">Local</span>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Data Viewer Title - only show on data tab */}
            {activeTab === 'data' && (
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <span className="text-slate-700 dark:text-slate-200 font-medium text-sm">Database Browser</span>
              </div>
            )}
          </div>

          {/* Project Actions - only show on builder tab */}
          {activeTab === 'builder' && (
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {/* Queue Button */}
              <button
                onClick={() => setQueuePanelOpen(!queuePanelOpen)}
                className={`p-1.5 rounded transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 ${queuePanelOpen ? 'text-blue-500 dark:text-blue-400 bg-slate-200 dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'}`}
                aria-label="Toggle Job Queue"
                title="Toggle Job Queue"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
              {/* Settings Button */}
              <button
                onClick={() => setSettingsPanelOpen(true)}
                className="p-1.5 rounded transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                aria-label="Settings"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Builder (with optional Data Viewer) or Empty State */}
        <div className="flex-1 relative min-h-0">
          {activePackageFlowData && activePackage ? (
            // Package flow view - show package flow with navigation
            <ZippBuilder
              key={`package-${activePackageFlow!.packageId}-${activePackageFlow!.flowId}`}
              initialGraph={activePackageFlowData.graph}
              onGraphChange={() => {}} // Package flows are read-only for now
              availableFlows={activePackage.flows.filter(f => f.id !== activePackageFlow!.flowId)}
              packageMacros={activePackage.macros}
              llmEndpoints={project.llmEndpoints}
              projectConstants={project.constants}
              projectSettings={project.settings}
              onUpdateSettings={updateSettings}
              flowId={activePackageFlowData.id}
              flowName={activePackageFlowData.name}
              showDataViewer={activeTab === 'data'}
              dataViewerComponent={
                <DataViewer
                  activeFlowId={activePackageFlowData.id}
                  packageId={activePackage.manifest.id}
                  flowName={activePackageFlowData.name}
                />
              }
              onShowToast={addToast}
              // Package mode props - pass the active package info
              packageMode={{
                manifest: activePackage.manifest,
                flow: activePackageFlowData,
                sourcePath: activePackage.sourcePath,
              }}
              onClosePackage={() => handleClosePackage(activePackage.manifest.id)}
              onReloadPackage={() => handleReloadPackage(activePackage.manifest.id)}
              onLoadPackage={handleLoadPackage}
              // Package nodes - show package nodes when viewing package flow
              activePackageId={activePackage.manifest.id}
              packageNodes={getAllPackageNodes()}
            />
          ) : activePackageFlow && !activePackageFlowData ? (
            // Package is selected but flow data not found - show error
            <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-transparent">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-medium text-slate-700 dark:text-slate-300 mb-2">Flow Not Found</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-4">
                  The selected flow "{activePackageFlow.flowId}" could not be found in the package.
                  {activePackage ? ` The package "${activePackage.manifest.name}" contains ${activePackage.flows.length} flow(s).` : ''}
                </p>
                <div className="flex gap-2 justify-center">
                  {activePackage && activePackage.flows.length > 0 && (
                    <button
                      onClick={() => setActivePackageFlow({ packageId: activePackageFlow.packageId, flowId: activePackage.flows[0].id })}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                    >
                      View First Flow
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setActivePackageFlow(null);
                      if (project.flows.length > 0) {
                        setActiveFlowId(project.flows[0].id);
                      }
                    }}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Close Package
                  </button>
                </div>
              </div>
            </div>
          ) : activeFlow ? (
            <ZippBuilder
              key={`${activeFlowId}-${resetCounter}`}
              initialGraph={activeFlow.graph}
              onGraphChange={handleGraphChange}
              availableFlows={getAllFlows().filter(f => f.id !== activeFlowId)}
              llmEndpoints={project.llmEndpoints}
              projectConstants={project.constants}
              projectSettings={project.settings}
              onUpdateSettings={updateSettings}
              flowId={activeFlow.id}
              flowName={activeFlow.name}
              isMacro={activeFlow.isMacro}
              isMacroModified={activeFlow.isMacro ? hasMacroBeenModified(activeFlow.id) : false}
              onSaveMacro={activeFlow.isMacro ? () => handleSaveMacroChanges(activeFlow.id) : undefined}
              onRevertMacro={activeFlow.isMacro ? () => handleRevertMacro(activeFlow.id) : undefined}
              onRunMacro={activeFlow.isMacro ? () => setMacroRunnerFlow(activeFlow) : undefined}
              showDataViewer={activeTab === 'data'}
              dataViewerComponent={
                <DataViewer
                  activeFlowId={activeFlow.id}
                  flowName={activeFlow.name}
                />
              }
              onShowToast={addToast}
              onCreateFlowForAgent={handleCreateFlowForAgent}
              onLoadPackage={handleLoadPackage}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-transparent">
              <div className="text-center">
                <svg className="w-16 h-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h2 className="text-xl font-medium text-slate-500 dark:text-slate-400 mb-2">No Flow Selected</h2>
                <p className="text-slate-400 dark:text-slate-500 mb-4">Create a new flow or select one from the sidebar</p>
                <button
                  onClick={() => createFlow('New Flow')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Create Flow
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        settings={getSettings()}
        constants={project.constants || []}
        onUpdateSettings={updateSettings}
        onUpdateConstant={updateConstant}
        onCreateConstant={createConstant}
        onApplyDefaultsToAllNodes={handleApplyDefaultsToAllNodes}
        onShowToast={addToast}
      />

      {/* New project confirmation dialog */}
      <ConfirmDialog
        isOpen={showNewProjectDialog}
        title="Create New Project"
        message="This will create a new empty project. Any unsaved changes will be lost."
        confirmLabel="Create New"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          setShowNewProjectDialog(false);
          newProject();
          addToast('New project created', 'success');
        }}
        onCancel={() => setShowNewProjectDialog(false)}
      />

      {/* Queue Panel */}
      <QueuePanel
        isOpen={queuePanelOpen}
        onClose={() => setQueuePanelOpen(false)}
        onNavigateToFlow={(flowId) => {
          setActiveFlowId(flowId);
          setQueuePanelOpen(false);
        }}
      />

      {/* Local Network Permission Dialog */}
      {permissionRequest && (
        <LocalNetworkPermissionDialog
          request={permissionRequest}
          onResponse={handlePermissionResponse}
        />
      )}

      {/* Package Trust Dialog */}
      {pendingPackage && !pendingDependencies && (
        <TrustDialog
          manifest={pendingPackage.manifest}
          onConfirm={handlePackageTrustConfirm}
          onCancel={() => setPendingPackage(null)}
        />
      )}

      {/* Dependency Resolution Dialog */}
      {pendingDependencies && (
        <DependencyDialog
          isOpen={true}
          packageName={pendingDependencies.packageName}
          dependencies={pendingDependencies.dependencies}
          loadedPackages={loadedPackages}
          onPackageLoaded={handleDependencyLoaded}
          onAllLoaded={handleDependenciesSatisfied}
          onContinueAnyway={handleContinueWithoutDeps}
          onCancel={() => {
            setPendingDependencies(null);
            setPendingPackage(null);
          }}
        />
      )}

      {/* Package Changed Dialog */}
      <ConfirmDialog
        isOpen={changedPackage !== null}
        title="Package Updated"
        message={changedPackage ? `The package "${changedPackage.manifest.name}" has been modified. Would you like to reload it to see the changes?` : ''}
        confirmLabel="Reload"
        cancelLabel="Ignore"
        variant="info"
        onConfirm={() => {
          if (changedPackage) {
            handleReloadPackage(changedPackage.packageId);
          }
        }}
        onCancel={() => clearChangedPackage()}
      />

      {/* Package Browser Dialog */}
      <PackageBrowser
        isOpen={showPackageBrowser}
        onClose={() => setShowPackageBrowser(false)}
        onLoadPackage={handleLoadPackageFromPath}
        loadedPackageIds={new Set(loadedPackages.keys())}
      />

      {/* Macro Runner Modal */}
      {macroRunnerFlow && (
        <MacroRunnerModal
          macro={macroRunnerFlow}
          onClose={() => setMacroRunnerFlow(null)}
          onShowToast={addToast}
        />
      )}
    </div>
    </JobQueueProvider>
  );
}

import { memo, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { Position } from '@xyflow/react';
import { CollapsibleNodeWrapper, type HandleConfig, type ValidationIssue } from 'zipp-ui-components';

import type { ComfyUIAnalysis, ProjectSettings } from 'zipp-core';
import { analyzeComfyUIWorkflow, getWorkflowSummary } from 'zipp-core';
import { analyzeComfyUIVideoWorkflow } from '../comfyui-video-analyzer';

export type SeedMode = 'random' | 'fixed' | 'workflow';

export interface ComfyUIImageInputConfig {
    nodeId: string;
    title: string;
    nodeType: string;
    allowBypass: boolean;
}

interface VideoGenNodeData {
    endpoint?: string;
    projectSettings?: ProjectSettings;
    // ComfyUI workflow (loaded from file)
    comfyWorkflow?: string;
    comfyWorkflowName?: string;
    // Embedded ComfyUI workflow (from macro definition)
    comfyuiWorkflow?: Record<string, unknown>;
    workflowInputs?: {
        promptNodeId?: string;
        promptInputKey?: string;
        imageNodeId?: string;
        imageInputKey?: string;
        seedNodeId?: string;
        seedInputKey?: string;
    };
    comfyPrimaryPromptNodeId?: string | null;
    comfyImageInputNodeIds?: string[]; // Legacy
    comfyImageInputConfigs?: ComfyUIImageInputConfig[];
    comfySeedMode?: SeedMode;
    comfyFixedSeed?: number | null;
    comfyAllImageNodeIds?: string[]; // For bypassing

    // Video-specific parameters
    comfyFrameCountNodeId?: string;
    comfyFrameCount?: number;
    comfyResolutionNodeId?: string;
    comfyWidth?: number;
    comfyHeight?: number;
    comfyFrameRateNodeId?: string;
    comfyFrameRate?: number;

    _status?: 'running' | 'completed' | 'error';
    _collapsed?: boolean;

    onEndpointChange?: (value: string) => void;
    onCollapsedChange?: (value: boolean) => void;
    onComfyWorkflowChange?: (value: string) => void;
    onComfyWorkflowNameChange?: (value: string) => void;
    onComfyPrimaryPromptNodeIdChange?: (value: string | null) => void;
    onComfyImageInputNodeIdsChange?: (value: string[]) => void;
    onComfyImageInputConfigsChange?: (value: ComfyUIImageInputConfig[]) => void;
    onComfySeedModeChange?: (value: SeedMode) => void;
    onComfyFixedSeedChange?: (value: number | null) => void;
    onComfyAllImageNodeIdsChange?: (value: string[]) => void;

    // Video parameter change handlers
    onComfyFrameCountNodeIdChange?: (value: string) => void;
    onComfyFrameCountChange?: (value: number) => void;
    onComfyResolutionNodeIdChange?: (value: string) => void;
    onComfyWidthChange?: (value: number) => void;
    onComfyHeightChange?: (value: number) => void;
    onComfyFrameRateNodeIdChange?: (value: string) => void;
    onComfyFrameRateChange?: (value: number) => void;

    // Callback to open workflow dialog
    onOpenComfyWorkflowDialog?: (analysis: ComfyUIAnalysis, fileName: string) => void;
}

interface VideoGenNodeProps {
    data: VideoGenNodeData;
}

// Icon for the node header
const VideoGenIcon = (
    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

function VideoGenNode({ data }: VideoGenNodeProps) {
    const onEndpointChangeRef = useRef(data.onEndpointChange);
    const onCollapsedChangeRef = useRef(data.onCollapsedChange);
    const onComfyWorkflowChangeRef = useRef(data.onComfyWorkflowChange);
    const onComfyWorkflowNameChangeRef = useRef(data.onComfyWorkflowNameChange);
    const onComfyPrimaryPromptNodeIdChangeRef = useRef(data.onComfyPrimaryPromptNodeIdChange);
    const onComfyImageInputNodeIdsChangeRef = useRef(data.onComfyImageInputNodeIdsChange);
    const onComfyImageInputConfigsChangeRef = useRef(data.onComfyImageInputConfigsChange);
    const onComfySeedModeChangeRef = useRef(data.onComfySeedModeChange);
    const onComfyFixedSeedChangeRef = useRef(data.onComfyFixedSeedChange);
    const onComfyAllImageNodeIdsChangeRef = useRef(data.onComfyAllImageNodeIdsChange);
    const onOpenComfyWorkflowDialogRef = useRef(data.onOpenComfyWorkflowDialog);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        onEndpointChangeRef.current = data.onEndpointChange;
        onCollapsedChangeRef.current = data.onCollapsedChange;
        onComfyWorkflowChangeRef.current = data.onComfyWorkflowChange;
        onComfyWorkflowNameChangeRef.current = data.onComfyWorkflowNameChange;
        onComfyPrimaryPromptNodeIdChangeRef.current = data.onComfyPrimaryPromptNodeIdChange;
        onComfyImageInputNodeIdsChangeRef.current = data.onComfyImageInputNodeIdsChange;
        onComfyImageInputConfigsChangeRef.current = data.onComfyImageInputConfigsChange;
        onComfySeedModeChangeRef.current = data.onComfySeedModeChange;
        onComfyFixedSeedChangeRef.current = data.onComfyFixedSeedChange;
        onComfyAllImageNodeIdsChangeRef.current = data.onComfyAllImageNodeIdsChange;
        onOpenComfyWorkflowDialogRef.current = data.onOpenComfyWorkflowDialog;
    });

    const handleCollapsedChange = useCallback((collapsed: boolean) => {
        onCollapsedChangeRef.current?.(collapsed);
    }, []);

    // Handle ComfyUI workflow file selection
    const handleWorkflowFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const analysis = analyzeComfyUIWorkflow(content);

            if (!analysis.isValid) {
                alert(`Invalid workflow: ${analysis.error}`);
                return;
            }

            // If workflow has configurable inputs, show dialog at ZippBuilder level
            if (analysis.prompts.length > 0 || analysis.images.length > 0) {
                // Use the callback to open dialog at ZippBuilder level
                onOpenComfyWorkflowDialogRef.current?.(analysis, file.name);
            } else {
                // No inputs to configure, just apply directly
                onComfyWorkflowChangeRef.current?.(content);
                onComfyWorkflowNameChangeRef.current?.(file.name);
                onComfyPrimaryPromptNodeIdChangeRef.current?.(null);
                onComfyImageInputNodeIdsChangeRef.current?.([]);
                onComfyImageInputConfigsChangeRef.current?.([]);
            }
        };
        reader.readAsText(file);

        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    // Clear ComfyUI workflow
    const handleClearWorkflow = useCallback(() => {
        onComfyWorkflowChangeRef.current?.('');
        onComfyWorkflowNameChangeRef.current?.('');
        onComfyPrimaryPromptNodeIdChangeRef.current?.(null);
        onComfyImageInputNodeIdsChangeRef.current?.([]);
        onComfyImageInputConfigsChangeRef.current?.([]);
        onComfySeedModeChangeRef.current?.('random');
        onComfyFixedSeedChangeRef.current?.(null);
        onComfyAllImageNodeIdsChangeRef.current?.([]);
    }, []);

    // Check if there's an embedded workflow from macro
    const hasEmbeddedWorkflow = useMemo(() => {
        return data.comfyuiWorkflow && Object.keys(data.comfyuiWorkflow).length > 0;
    }, [data.comfyuiWorkflow]);

    // Count nodes in embedded workflow
    const embeddedWorkflowNodeCount = useMemo(() => {
        if (!hasEmbeddedWorkflow) return 0;
        return Object.keys(data.comfyuiWorkflow!).length;
    }, [hasEmbeddedWorkflow, data.comfyuiWorkflow]);

    // Analyze current workflow for display (image prompts etc)
    const workflowAnalysis = useMemo(() => {
        if (data.comfyWorkflow) {
            return analyzeComfyUIWorkflow(data.comfyWorkflow);
        }
        if (hasEmbeddedWorkflow) {
            return analyzeComfyUIWorkflow(JSON.stringify(data.comfyuiWorkflow));
        }
        return null;
    }, [data.comfyWorkflow, hasEmbeddedWorkflow, data.comfyuiWorkflow]);

    // Analyze for video-specific parameters
    const videoAnalysis = useMemo(() => {
        if (data.comfyWorkflow) {
            return analyzeComfyUIVideoWorkflow(data.comfyWorkflow);
        }
        if (hasEmbeddedWorkflow) {
            return analyzeComfyUIVideoWorkflow(JSON.stringify(data.comfyuiWorkflow));
        }
        return null;
    }, [data.comfyWorkflow, hasEmbeddedWorkflow, data.comfyuiWorkflow]);

    const validationIssues = useMemo(() => {
        const issues: ValidationIssue[] = [];
        if (!data.comfyWorkflow && !hasEmbeddedWorkflow) {
            issues.push({ field: 'Workflow', message: 'Load a workflow file' });
        }
        return issues;
    }, [data.comfyWorkflow, hasEmbeddedWorkflow]);

    const collapsedPreview = (
        <div className="text-slate-400">
            <span className="text-orange-400 font-medium">ComfyUI</span>
            {data.comfyWorkflowName && (
                <span className="text-slate-500 ml-1 text-xs">({data.comfyWorkflowName})</span>
            )}
            {!data.comfyWorkflowName && hasEmbeddedWorkflow && (
                <span className="text-green-500 ml-1 text-xs">(Embedded)</span>
            )}
        </div>
    );

    // Input handles using HandleConfig
    const inputHandles = useMemo<HandleConfig[]>(() => {
        const handles: HandleConfig[] = [];

        // Prompt input
        const hasWorkflow = data.comfyWorkflow || hasEmbeddedWorkflow;
        const hasPromptNode = data.comfyPrimaryPromptNodeId !== null || (hasEmbeddedWorkflow && data.workflowInputs?.promptNodeId);
        const showPromptInput = !hasWorkflow || hasPromptNode;
        if (showPromptInput) {
            handles.push({ id: 'prompt', type: 'target', position: Position.Left, color: '!bg-blue-500', label: 'prompt', labelColor: 'text-blue-400', size: 'lg' });
        }

        // Dynamic image inputs
        if (data.comfyImageInputConfigs && data.comfyImageInputConfigs.length > 0) {
            data.comfyImageInputConfigs.forEach((config, index) => {
                const label = config.title || `image ${index + 1}`;
                const bypassIndicator = config.allowBypass ? ' (opt)' : '';
                handles.push({
                    id: `image_${index}`,
                    type: 'target',
                    position: Position.Left,
                    color: config.allowBypass ? '!bg-purple-400' : '!bg-purple-500',
                    label: `${label.toLowerCase()}${bypassIndicator}`,
                    labelColor: config.allowBypass ? 'text-purple-300' : 'text-purple-400',
                    size: 'md',
                });
            });
        } else if (data.comfyImageInputNodeIds && data.comfyImageInputNodeIds.length > 0) {
            // Legacy fallback
            data.comfyImageInputNodeIds.forEach((nodeId, index) => {
                const analysis = workflowAnalysis;
                const imageInput = analysis?.images.find(img => img.nodeId === nodeId);
                const label = imageInput?.title || `image ${index + 1}`;
                handles.push({
                    id: `image_${index}`,
                    type: 'target',
                    position: Position.Left,
                    color: '!bg-purple-500',
                    label: label.toLowerCase(),
                    labelColor: 'text-purple-400',
                    size: 'md',
                });
            });
        } else if (hasEmbeddedWorkflow && data.workflowInputs?.imageNodeId) {
            // For embedded workflows: add image input based on workflowInputs
            handles.push({
                id: 'image_0',
                type: 'target',
                position: Position.Left,
                color: '!bg-purple-500',
                label: 'image',
                labelColor: 'text-purple-400',
                size: 'md',
            });
        }

        // Frame count input (for dynamic video length control)
        handles.push({
            id: 'frameCount',
            type: 'target',
            position: Position.Left,
            color: '!bg-green-500',
            label: 'frames',
            labelColor: 'text-green-400',
            size: 'sm',
        });

        return handles;
    }, [data.comfyWorkflow, data.comfyPrimaryPromptNodeId, data.comfyImageInputNodeIds, data.comfyImageInputConfigs, workflowAnalysis, hasEmbeddedWorkflow, data.workflowInputs]);

    // Output handles
    const outputHandles = useMemo<HandleConfig[]>(() => [
        { id: 'video', type: 'source', position: Position.Right, color: '!bg-orange-500', size: 'lg', label: 'video' },
    ], []);

    return (
        <>
            <CollapsibleNodeWrapper
                title="Video Generator"
                color="orange"
                icon={VideoGenIcon}
                width={280}
                collapsedWidth={160}
                status={data._status}
                validationIssues={validationIssues}
                isCollapsed={data._collapsed}
                onCollapsedChange={handleCollapsedChange}
                collapsedPreview={collapsedPreview}
                inputHandles={inputHandles}
                outputHandles={outputHandles}
            >
                <div>
                    {/* ComfyUI Workflow File Picker */}
                    <div>
                        <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">Workflow</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleWorkflowFileSelect}
                            className="hidden"
                        />
                        {(data.comfyWorkflow || hasEmbeddedWorkflow) ? (
                            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded p-2">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-green-400 font-medium truncate flex-1">
                                        {data.comfyWorkflowName || (hasEmbeddedWorkflow ? `Embedded (${embeddedWorkflowNodeCount} nodes)` : 'workflow.json')}
                                    </span>
                                    {data.comfyWorkflow && (
                                        <button
                                            onClick={handleClearWorkflow}
                                            className="text-slate-500 hover:text-red-400 ml-2"
                                            title="Remove workflow"
                                        >
                                            <svg className="w-4 h-4 text-slate-500 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                {workflowAnalysis && (
                                    <p className="text-xs text-slate-500">{getWorkflowSummary(workflowAnalysis)}</p>
                                )}
                                {hasEmbeddedWorkflow && !data.comfyWorkflow && data.workflowInputs && (
                                    <div className="mt-1 text-xs text-slate-500">
                                        Prompt: node {data.workflowInputs.promptNodeId} | Image: node {data.workflowInputs.imageNodeId}
                                    </div>
                                )}

                                {/* Show seed configuration */}
                                {data.comfySeedMode && (
                                    <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-700">
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-500">Seed:</span>
                                            {data.comfySeedMode === 'random' && (
                                                <span className="text-green-400">Random each run</span>
                                            )}
                                            {data.comfySeedMode === 'fixed' && (
                                                <span className="text-blue-400">Fixed ({data.comfyFixedSeed})</span>
                                            )}
                                            {data.comfySeedMode === 'workflow' && (
                                                <span className="text-slate-400">From workflow</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Show configured image inputs */}
                                {data.comfyImageInputConfigs && data.comfyImageInputConfigs.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-700">
                                        <p className="text-xs text-slate-500 mb-1">Image inputs:</p>
                                        <div className="space-y-1">
                                            {data.comfyImageInputConfigs.map((config) => (
                                                <div key={config.nodeId} className="flex items-center gap-2 text-xs">
                                                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                                                    <span className="text-slate-300">{config.title}</span>
                                                    {config.allowBypass ? (
                                                        <span className="text-green-400 text-[10px]">(optional)</span>
                                                    ) : (
                                                        <span className="text-amber-400 text-[10px]">(required)</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Video Parameters - always show resolution when workflow loaded */}
                                {(data.comfyWorkflow || hasEmbeddedWorkflow) && (
                                    <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-700">
                                        <p className="text-xs text-slate-500 mb-2">Video parameters:</p>
                                        <div className="space-y-2">
                                            {/* Frame Count - only when detected */}
                                            {videoAnalysis && videoAnalysis.lengths.length > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <label className="text-xs text-slate-400 w-14">Frames:</label>
                                                    <input
                                                        type="number"
                                                        value={data.comfyFrameCount ?? ''}
                                                        placeholder={String(videoAnalysis.lengths[0].currentValue)}
                                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                            const val = e.target.value;
                                                            data.onComfyFrameCountChange?.(val === '' ? undefined as any : parseInt(val));
                                                        }}
                                                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                                        className="nodrag flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white"
                                                        min={1}
                                                    />
                                                </div>
                                            )}
                                            {/* Resolution - always show when workflow loaded */}
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs text-slate-400 w-14">Size:</label>
                                                <input
                                                    type="number"
                                                    value={data.comfyWidth ?? ''}
                                                    placeholder={videoAnalysis?.resolutions[0]?.width?.toString() ?? '1280'}
                                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                        const val = e.target.value;
                                                        data.onComfyWidthChange?.(val === '' ? undefined as any : parseInt(val));
                                                    }}
                                                    onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                                    className="nodrag w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white"
                                                    min={1}
                                                />
                                                <span className="text-slate-500 text-xs">×</span>
                                                <input
                                                    type="number"
                                                    value={data.comfyHeight ?? ''}
                                                    placeholder={videoAnalysis?.resolutions[0]?.height?.toString() ?? '720'}
                                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                        const val = e.target.value;
                                                        data.onComfyHeightChange?.(val === '' ? undefined as any : parseInt(val));
                                                    }}
                                                    onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                                    className="nodrag w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white"
                                                    min={1}
                                                />
                                            </div>
                                            {/* Frame Rate - only when detected */}
                                            {videoAnalysis && videoAnalysis.frameRates.length > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <label className="text-xs text-slate-400 w-14">FPS:</label>
                                                    <input
                                                        type="number"
                                                        value={data.comfyFrameRate ?? ''}
                                                        placeholder={String(videoAnalysis.frameRates[0].currentValue)}
                                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                            const val = e.target.value;
                                                            data.onComfyFrameRateChange?.(val === '' ? undefined as any : parseFloat(val));
                                                        }}
                                                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                                        className="nodrag w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white"
                                                        min={1}
                                                        step="0.1"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-2 text-xs text-orange-400 hover:text-orange-300"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    Change workflow
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag w-full bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 hover:border-orange-500 rounded p-3 text-center transition-colors"
                            >
                                <svg className="w-6 h-6 mx-auto text-slate-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span className="text-sm text-slate-400">Load ComfyUI workflow</span>
                                <p className="text-xs text-slate-600 mt-1">.json exported from ComfyUI</p>
                            </button>
                        )}
                    </div>

                    {/* ComfyUI endpoint */}
                    {(data.comfyWorkflow || hasEmbeddedWorkflow) && (
                        <div className="mt-2">
                            <label className="text-slate-600 dark:text-slate-400 text-xs block mb-1">ComfyUI Server</label>
                            <input
                                type="text"
                                className="nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 font-mono"
                                placeholder={data.projectSettings?.defaultVideoEndpoint || "http://localhost:8188"}
                                value={data.endpoint || data.projectSettings?.defaultVideoEndpoint || 'http://localhost:8188'}
                                onChange={(e) => onEndpointChangeRef.current?.(e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                </div>
            </CollapsibleNodeWrapper>
        </>
    );
}

export default memo(VideoGenNode);

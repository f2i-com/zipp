import { memo, useMemo } from 'react';
import type { Node } from '@xyflow/react';
import { PropertyField } from 'zipp-ui-components/nodes/fields/PropertyField';
import type { NodeDefinition } from 'zipp-core';
import { BUNDLED_MODULES, getModuleLoader } from 'zipp-core';
import { getCustomNodeDefinition } from '../../services/customNodeRegistry';

interface PropertiesPanelProps {
    selectedNode: Node | null;
    updateNodeData: (id: string, data: Record<string, unknown>) => void;
    className?: string;
}

const PropertiesPanel = memo(({ selectedNode, updateNodeData, className = '' }: PropertiesPanelProps) => {
    // Get definition from node data, or fallback to looking it up in the registry
    // This handles legacy nodes or nodes that lost their definition reference
    // NOTE: Hooks must be called unconditionally before any early returns
    const definition = useMemo((): NodeDefinition | undefined => {
        if (!selectedNode) return undefined;

        if (selectedNode.data.__definition) {
            return selectedNode.data.__definition as NodeDefinition;
        }

        // Fallback lookup in bundled modules
        for (const module of BUNDLED_MODULES) {
            const found = module.nodes.find(n => n.id === selectedNode.type);
            if (found) return found;
        }

        // Fallback lookup in custom node registry (for TypeScript-based embedded nodes)
        if (selectedNode.type) {
            const customDef = getCustomNodeDefinition(selectedNode.type);
            if (customDef) return customDef;

            // Fallback lookup in ModuleLoader (for path-based package nodes)
            const moduleLoader = getModuleLoader();
            const loaderDef = moduleLoader.getNodeDefinition(selectedNode.type);
            if (loaderDef) return loaderDef;
        }

        return undefined;
    }, [selectedNode?.data.__definition, selectedNode?.type, selectedNode]);

    // Calculate all current values for conditional visibility logic
    const allValues = useMemo(() => {
        if (!selectedNode || !definition) return {};

        const values: Record<string, unknown> = {};
        const props = definition.properties || [];
        for (const prop of props) {
            // Use current node data value, or default from definition
            values[prop.id] = selectedNode.data[prop.id] ?? prop.default;
        }
        return values;
    }, [definition, selectedNode]);

    // If no node selected, show placeholder
    if (!selectedNode) {
        return (
            <div className={`flex flex-col items-center justify-center h-full text-slate-500 p-4 ${className}`}>
                <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-sm font-medium">Select a node to view properties</p>
                <p className="text-xs mt-1">Click on any node in the canvas to edit its configuration.</p>
            </div>
        );
    }

    if (!definition) {
        return (
            <div className={`p-4 ${className}`}>
                <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 text-amber-200">
                    <h3 className="font-bold mb-1">Unknown Node Type</h3>
                    <p className="text-sm opacity-80">
                        Could not find definition for node type: <code className="bg-black/30 px-1 rounded">{selectedNode.type}</code>
                    </p>
                </div>
            </div>
        );
    }

    const handleFieldChange = (fieldId: string) => (value: unknown) => {
        // Direct update via updateNodeData
        // We do NOT use selectedNode.data.onChange here because that handler is often 
        // bound specifically to the 'value' property in ZippBuilder (created via createHandler('value')).
        // Using it for other fields would incorrectly overwrite the 'value' property.
        updateNodeData(selectedNode.id, { [fieldId]: value });
    };

    return (
        <div className={`flex flex-col h-full bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm ${className}`}>
            {/* Header */}
            <div className="p-3 border-b border-slate-200/50 dark:border-slate-700/50 flex items-center gap-2 bg-slate-100/30 dark:bg-slate-800/30">
                <div className={`w-2 h-8 rounded-full bg-${definition.color || 'slate'}-500`} />
                <div>
                    <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{definition.name}</h2>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{selectedNode.id}</div>
                </div>
            </div>

            {/* Properties Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {(!definition.properties || definition.properties.length === 0) && (
                    <p className="text-slate-400 dark:text-slate-500 text-sm italic">No properties to configure.</p>
                )}

                {(definition.properties || []).map((prop) => (
                    <PropertyField
                        key={prop.id}
                        property={prop}
                        value={selectedNode.data[prop.id]}
                        onChange={handleFieldChange(prop.id)}
                        allValues={allValues}
                    />
                ))}
            </div>
        </div>
    );
});

PropertiesPanel.displayName = 'PropertiesPanel';

export default PropertiesPanel;

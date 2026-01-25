/**
 * useNodeGrouping Hook
 *
 * Provides functionality to group and ungroup nodes in a React Flow canvas.
 * Extracted from ZippBuilder.tsx for maintainability.
 */

import { useCallback } from 'react';
import type { Node } from '@xyflow/react';

interface UseNodeGroupingOptions {
  /** Current nodes in the canvas */
  nodes: Node[];
  /** Function to update nodes */
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  /** Optional toast notification callback */
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface UseNodeGroupingReturn {
  /** Group selected nodes into a group node */
  handleGroupSelected: () => void;
  /** Ungroup selected group nodes */
  handleUngroupSelected: () => void;
}

/**
 * Hook that provides grouping and ungrouping functionality for React Flow nodes.
 */
export function useNodeGrouping({
  nodes,
  setNodes,
  onShowToast,
}: UseNodeGroupingOptions): UseNodeGroupingReturn {
  // Group selected nodes
  const handleGroupSelected = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected && n.type !== 'group');
    if (selectedNodes.length < 2) return;

    // Calculate bounding box of selected nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of selectedNodes) {
      const nodeWidth = (node.measured?.width || node.width || 280);
      const nodeHeight = (node.measured?.height || node.height || 150);
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + nodeWidth);
      maxY = Math.max(maxY, node.position.y + nodeHeight);
    }

    // Add padding around the group
    const padding = 40;
    const groupX = minX - padding;
    const groupY = minY - padding;
    const groupWidth = maxX - minX + padding * 2;
    const groupHeight = maxY - minY + padding * 2;

    // Create group node ID
    const groupId = `group_${Date.now()}`;

    // Create the group node
    const groupNode = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      style: { width: groupWidth, height: groupHeight },
      data: { label: 'Group', color: 'slate' },
    };

    // Update selected nodes to be children of the group
    const updatedNodes = nodes.map((node) => {
      if (node.selected && node.type !== 'group') {
        return {
          ...node,
          parentId: groupId,
          // Adjust position to be relative to group
          position: {
            x: node.position.x - groupX,
            y: node.position.y - groupY,
          },
          extent: 'parent' as const,
          selected: false,
        };
      }
      return node;
    });

    // Add group node at the beginning (so it renders behind other nodes)
    setNodes([groupNode as unknown as typeof nodes[0], ...updatedNodes]);
    onShowToast?.(`Grouped ${selectedNodes.length} nodes`, 'success');
  }, [nodes, setNodes, onShowToast]);

  // Ungroup selected group nodes
  const handleUngroupSelected = useCallback(() => {
    const selectedGroups = nodes.filter((n) => n.selected && n.type === 'group');
    if (selectedGroups.length === 0) return;

    const groupIds = new Set(selectedGroups.map((g) => g.id));
    let ungroupedCount = 0;

    // Update nodes: remove parentId from children and delete group nodes
    const updatedNodes = nodes.flatMap((node) => {
      // Remove group nodes
      if (groupIds.has(node.id)) {
        return [];
      }

      // If this node was a child of a deleted group, adjust its position
      if (node.parentId && groupIds.has(node.parentId)) {
        const parentGroup = selectedGroups.find((g) => g.id === node.parentId);
        if (parentGroup) {
          ungroupedCount++;
          return [{
            ...node,
            parentId: undefined,
            extent: undefined,
            position: {
              x: node.position.x + parentGroup.position.x,
              y: node.position.y + parentGroup.position.y,
            },
          }];
        }
      }

      return [node];
    });

    setNodes(updatedNodes);
    if (ungroupedCount > 0) {
      onShowToast?.(`Ungrouped ${ungroupedCount} nodes`, 'success');
    }
  }, [nodes, setNodes, onShowToast]);

  return {
    handleGroupSelected,
    handleUngroupSelected,
  };
}

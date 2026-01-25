import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';

function SelectableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  // Colors based on selection state
  const strokeColor = selected ? 'rgb(59, 130, 246)' : 'rgb(100, 116, 139)';
  const strokeWidth = selected ? 4 : 3;
  const startCircleColor = selected ? 'rgb(59, 130, 246)' : 'rgb(71, 85, 105)';

  return (
    <>
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={`arrow-${id}`}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M2,2 L10,6 L2,10 L4,6 Z"
            fill={strokeColor}
          />
        </marker>
      </defs>
      {/* Start circle marker at source */}
      <circle
        cx={sourceX}
        cy={sourceY}
        r={selected ? 7 : 6}
        fill={startCircleColor}
        stroke={strokeColor}
        strokeWidth={1.5}
      />
      {/* Invisible wider path for easier clicking */}
      <path
        id={`${id}-interaction`}
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={25}
        className="react-flow__edge-interaction"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
      />
      {/* Visible edge path with arrow */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#arrow-${id})`}
        style={{
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        }}
      />
      {/* Delete button when selected */}
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs cursor-pointer shadow-lg border border-red-400 transition-colors"
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(SelectableEdge);

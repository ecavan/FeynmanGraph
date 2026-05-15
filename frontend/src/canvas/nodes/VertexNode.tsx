import { Handle, type NodeProps, Position } from "reactflow";

export type VertexNodeData = { label?: string };

export const VERTEX_DIAMETER = 12;

/**
 * A Feynman vertex — drawn as a filled dot that the edges visually terminate
 * at. Handles cover the whole node (full opacity transparent) so react-flow
 * can route any drag-to-connect ops through the visual center, but
 * drag-to-connect is disabled at the canvas level (`nodesConnectable={false}`)
 * — particle creation goes through the toolbox form instead.
 */
export function VertexNode(props: NodeProps<VertexNodeData>) {
  return (
    <div
      style={{
        width: VERTEX_DIAMETER,
        height: VERTEX_DIAMETER,
        borderRadius: "50%",
        background: props.selected ? "#0066ff" : "#1a1a1a",
        border: props.selected ? "2px solid #0066ff" : "2px solid #333",
        boxShadow: props.selected ? "0 0 0 4px rgba(0, 102, 255, 0.25)" : undefined,
        position: "relative",
      }}
    >
      <Handle
        type="source"
        position={Position.Top}
        style={{
          width: "100%",
          height: "100%",
          left: 0,
          top: 0,
          transform: "none",
          borderRadius: "50%",
          background: "transparent",
          border: "none",
          opacity: 0,
        }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        style={{
          width: "100%",
          height: "100%",
          left: 0,
          top: 0,
          transform: "none",
          borderRadius: "50%",
          background: "transparent",
          border: "none",
          opacity: 0,
        }}
      />
    </div>
  );
}

import { Handle, type NodeProps, Position } from "reactflow";

export type VertexNodeData = { label?: string; draftSource?: boolean };

export const VERTEX_DIAMETER = 12;

export function VertexNode(props: NodeProps<VertexNodeData>) {
  const draft = props.data?.draftSource;
  const background = draft ? "#1ea75e" : props.selected ? "#0066ff" : "#1a1a1a";
  const border = draft
    ? "2px solid #1ea75e"
    : props.selected
    ? "2px solid #0066ff"
    : "2px solid #333";
  const shadow = draft
    ? "0 0 0 5px rgba(30, 167, 94, 0.35)"
    : props.selected
    ? "0 0 0 4px rgba(0, 102, 255, 0.25)"
    : undefined;
  return (
    <div
      style={{
        width: VERTEX_DIAMETER,
        height: VERTEX_DIAMETER,
        borderRadius: "50%",
        background,
        border,
        boxShadow: shadow,
        position: "relative",
        cursor: "grab",
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
          pointerEvents: "none",
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
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

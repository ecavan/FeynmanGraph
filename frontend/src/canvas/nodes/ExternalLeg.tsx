import { Handle, type NodeProps, Position } from "reactflow";
import { VERTEX_DIAMETER } from "./VertexNode";

export type ExternalLegData = { kind: "incoming" | "outgoing"; label: string };

/** External leg rendered as a small colored dot (same size as an internal
 *  vertex) with the leg label only on hover/selection. Lines visibly meet
 *  at the dot's center. */
export function ExternalLegNode(props: NodeProps<ExternalLegData>) {
  const isIncoming = props.data.kind === "incoming";
  const baseColor = isIncoming ? "#2f8a3a" : "#c0392b";
  const labelColor = isIncoming ? "#1d6024" : "#7a1c12";
  return (
    <div
      title={`${props.data.label} (${props.data.kind})`}
      style={{
        width: VERTEX_DIAMETER,
        height: VERTEX_DIAMETER,
        borderRadius: "50%",
        background: props.selected ? "#0066ff" : baseColor,
        border: props.selected ? "2px solid #0066ff" : `2px solid ${baseColor}`,
        boxShadow: props.selected ? "0 0 0 4px rgba(0, 102, 255, 0.25)" : undefined,
        position: "relative",
        cursor: "pointer",
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
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
        position={Position.Left}
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
      <span
        className="external-leg-label"
        style={{
          position: "absolute",
          top: -22,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 11,
          fontWeight: 600,
          color: labelColor,
          background: "white",
          padding: "0 4px",
          borderRadius: 3,
          fontFamily:
            '"Latin Modern Math", "Cambria Math", "Times New Roman", serif',
          whiteSpace: "nowrap",
          opacity: props.selected ? 1 : 0,
          transition: "opacity 120ms ease-out",
          pointerEvents: "none",
        }}
      >
        {props.data.label}
      </span>
    </div>
  );
}

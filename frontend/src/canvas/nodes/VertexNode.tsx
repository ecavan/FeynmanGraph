import { Handle, type NodeProps, Position } from "reactflow";

export type VertexNodeData = { label?: string };

export const VERTEX_DIAMETER = 12;

/**
 * A Feynman vertex — drawn as a filled black dot that the edges visually
 * terminate at. Bigger than the standard react-flow node so edges look like
 * they're swallowed at a single point regardless of incident angle.
 *
 * The Handle is centered and covers the whole node; this lets react-flow
 * route connection endpoints through the visual center if drag-to-connect is
 * ever re-enabled.
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

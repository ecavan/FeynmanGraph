import { Handle, type NodeProps, Position } from "reactflow";

export type VertexNodeData = { label?: string };

export function VertexNode(props: NodeProps<VertexNodeData>) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: props.selected ? "#0066ff" : "#222",
        border: props.selected ? "2px solid #0066ff" : "2px solid #555",
        boxShadow: props.selected ? "0 0 0 3px rgba(0, 102, 255, 0.25)" : undefined,
      }}
    >
      <Handle type="source" position={Position.Top} style={{ opacity: 0.01 }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0.01 }} />
    </div>
  );
}

import { Handle, type NodeProps, Position } from "reactflow";

export type VertexNodeData = { label?: string };

export function VertexNode(_props: NodeProps<VertexNodeData>) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#222",
        border: "2px solid #555",
      }}
    >
      <Handle type="source" position={Position.Top} style={{ opacity: 0.01 }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0.01 }} />
    </div>
  );
}

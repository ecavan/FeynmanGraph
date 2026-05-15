import { Handle, type NodeProps, Position } from "reactflow";

export type ExternalLegData = { kind: "incoming" | "outgoing"; label: string };

export function ExternalLegNode(props: NodeProps<ExternalLegData>) {
  const isIncoming = props.data.kind === "incoming";
  return (
    <div
      style={{
        padding: "4px 8px",
        background: isIncoming ? "#cfe" : "#fce",
        border: props.selected ? "2px solid #0066ff" : "1px solid #888",
        boxShadow: props.selected ? "0 0 0 2px rgba(0, 102, 255, 0.25)" : undefined,
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      {props.data.label} ({props.data.kind})
      <Handle type="source" position={Position.Right} style={{ opacity: 0.01 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0.01 }} />
    </div>
  );
}

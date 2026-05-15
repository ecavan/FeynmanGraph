import { BaseEdge, type EdgeProps, EdgeLabelRenderer, getStraightPath } from "reactflow";

export type ParticleEdgeData = {
  particlePdgId: number | null;
  particleName?: string;
};

export function ParticleEdge(props: EdgeProps<ParticleEdgeData>) {
  const [path, labelX, labelY] = getStraightPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
  });
  const label = props.data?.particleName ?? (props.data?.particlePdgId ?? "?").toString();
  return (
    <>
      <BaseEdge id={props.id} path={path} style={{ stroke: "#444", strokeWidth: 1.5 }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: "white",
            padding: "0 4px",
            fontSize: 11,
            pointerEvents: "all",
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

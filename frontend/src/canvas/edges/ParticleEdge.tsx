import { type EdgeProps, EdgeLabelRenderer } from "reactflow";
import { visualForEdge } from "./particle-style";

export type ParticleEdgeData = {
  particlePdgId: number | null;
  particleName?: string;
};

export function ParticleEdge(props: EdgeProps<ParticleEdgeData>) {
  const { sourceX, sourceY, targetX, targetY, selected } = props;
  const visual = visualForEdge(props.data?.particlePdgId ?? null, sourceX, sourceY, targetX, targetY);

  // Midpoint for fermion arrow + label placement.
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const lineAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const label =
    props.data?.particleName ??
    (props.data?.particlePdgId == null ? "?" : props.data.particlePdgId.toString());

  return (
    <>
      {/* Wider invisible hit area so users can actually click thin lines. */}
      <path
        d={visual.path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: "pointer" }}
      />
      <path
        id={props.id}
        d={visual.path}
        fill="none"
        stroke={selected ? "#0066ff" : visual.stroke}
        strokeWidth={selected ? visual.strokeWidth + 1 : visual.strokeWidth}
        strokeDasharray={visual.strokeDasharray}
        style={{ pointerEvents: "none" }}
      />
      {visual.showArrow && (
        <polygon
          points="0,-5 10,0 0,5"
          fill={selected ? "#0066ff" : visual.stroke}
          transform={`translate(${labelX}, ${labelY}) rotate(${lineAngle})`}
          style={{ pointerEvents: "none" }}
        />
      )}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 14}px)`,
            background: "white",
            padding: "0 4px",
            fontSize: 11,
            border: selected ? "1px solid #0066ff" : "1px solid transparent",
            borderRadius: 3,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

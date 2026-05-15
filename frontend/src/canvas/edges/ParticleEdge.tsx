import { type EdgeProps, EdgeLabelRenderer } from "reactflow";
import { useDiagramStore } from "../../state/diagram";
import { VERTEX_DIAMETER } from "../nodes/VertexNode";
import { particleLabel, visualForEdge } from "./particle-style";

export type ParticleEdgeData = {
  particlePdgId: number | null;
};

// Approximate rendered size of an external-leg "dot" so the edge endpoint can
// snap to its visual center (same as a regular vertex now).
const EXTERNAL_LEG_DIAMETER = VERTEX_DIAMETER;

/**
 * Reads source/target positions from the diagram store and offsets to each
 * node's visual center. This makes edges visibly converge at a single point
 * inside each vertex regardless of incident angle — the "swallowed" look the
 * user asked for.
 */
export function ParticleEdge(props: EdgeProps<ParticleEdgeData>) {
  const sourceNode = useDiagramStore((s) =>
    s.nodes.find((n) => n.id === props.source),
  );
  const targetNode = useDiagramStore((s) =>
    s.nodes.find((n) => n.id === props.target),
  );
  const cachedModel = useDiagramStore((s) => s.cachedModel);
  const sourceLeg = useDiagramStore((s) =>
    s.externalLegs.find((l) => l.nodeId === props.source),
  );
  const targetLeg = useDiagramStore((s) =>
    s.externalLegs.find((l) => l.nodeId === props.target),
  );

  if (!sourceNode || !targetNode) return null;

  const sourceRadius = (sourceLeg ? EXTERNAL_LEG_DIAMETER : VERTEX_DIAMETER) / 2;
  const targetRadius = (targetLeg ? EXTERNAL_LEG_DIAMETER : VERTEX_DIAMETER) / 2;
  const sourceX = sourceNode.position[0] + sourceRadius;
  const sourceY = sourceNode.position[1] + sourceRadius;
  const targetX = targetNode.position[0] + targetRadius;
  const targetY = targetNode.position[1] + targetRadius;

  const { selected } = props;
  const pdg = props.data?.particlePdgId ?? null;
  const visual = visualForEdge(pdg, sourceX, sourceY, targetX, targetY);

  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const lineAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const particleName =
    pdg != null ? cachedModel?.particles.find((p) => p.pdg_id === pdg)?.name : undefined;
  const label = particleLabel(pdg, particleName);

  return (
    <>
      <path
        d={visual.path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
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
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 16}px)`,
            background: "white",
            padding: "1px 5px",
            fontSize: 12,
            fontFamily:
              '"Latin Modern Math", "Cambria Math", "Times New Roman", serif',
            color: selected ? "#0066ff" : visual.stroke,
            border: selected ? "1px solid #0066ff" : "1px solid transparent",
            borderRadius: 3,
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

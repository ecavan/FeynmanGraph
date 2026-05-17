import { type EdgeProps, EdgeLabelRenderer } from "reactflow";
import { useDiagramStore } from "../../state/diagram";
import { VERTEX_DIAMETER } from "../nodes/VertexNode";
import {
  circleSpine,
  particleLabel,
  quadraticSpine,
  straightSpine,
  type Spine,
  visualForSpine,
} from "./particle-style";

export type ParticleEdgeData = {
  particlePdgId: number | null;
};

const EXTERNAL_LEG_DIAMETER = VERTEX_DIAMETER;
const SELF_LOOP_RADIUS = 22;
const PARALLEL_EDGE_GAP = 26;
const LABEL_OFFSET = 14;

export function ParticleEdge(props: EdgeProps<ParticleEdgeData>) {
  const sourceNode = useDiagramStore((s) =>
    s.nodes.find((n) => n.id === props.source),
  );
  const targetNode = useDiagramStore((s) =>
    s.nodes.find((n) => n.id === props.target),
  );
  const cachedModel = useDiagramStore((s) => s.cachedModel);
  const allEdges = useDiagramStore((s) => s.edges);
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
  const isSelfLoop = props.source === props.target;

  // Stable sibling ordering by edge id so swapping doesn't shuffle the layout.
  const siblings = allEdges
    .filter((e) => {
      if (isSelfLoop) {
        return e.sourceNodeId === e.targetNodeId && e.sourceNodeId === props.source;
      }
      return (
        (e.sourceNodeId === props.source && e.targetNodeId === props.target) ||
        (e.sourceNodeId === props.target && e.targetNodeId === props.source)
      );
    })
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const siblingCount = siblings.length;
  const siblingIndex = Math.max(0, siblings.findIndex((e) => e.id === props.id));

  let spine: Spine;
  let labelOffsetX = 0;
  let labelOffsetY = -LABEL_OFFSET;

  if (isSelfLoop) {
    // Spread multiple loops evenly around the vertex; first one points up.
    const theta = -Math.PI / 2 + (siblingIndex * 2 * Math.PI) / Math.max(siblingCount, 1);
    const cx = sourceX + SELF_LOOP_RADIUS * Math.cos(theta);
    const cy = sourceY + SELF_LOOP_RADIUS * Math.sin(theta);
    // Start at the vertex (angle = theta + π from the loop center), go CCW.
    spine = circleSpine(cx, cy, SELF_LOOP_RADIUS, theta + Math.PI);
    labelOffsetX = LABEL_OFFSET * Math.cos(theta);
    labelOffsetY = LABEL_OFFSET * Math.sin(theta);
  } else if (siblingCount > 1) {
    const offset = (siblingIndex - (siblingCount - 1) / 2) * PARALLEL_EDGE_GAP;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cx = (sourceX + targetX) / 2 + nx * offset;
    const cy = (sourceY + targetY) / 2 + ny * offset;
    spine = quadraticSpine(sourceX, sourceY, cx, cy, targetX, targetY);
    if (offset !== 0) {
      const sign = offset > 0 ? 1 : -1;
      labelOffsetX = sign * LABEL_OFFSET * nx;
      labelOffsetY = sign * LABEL_OFFSET * ny;
    }
  } else {
    spine = straightSpine(sourceX, sourceY, targetX, targetY);
  }

  const visual = visualForSpine(pdg, spine);
  const mid = spine.sample(0.5);
  const arrowAngle = (Math.atan2(mid.ty, mid.tx) * 180) / Math.PI;
  const labelX = mid.x + labelOffsetX;
  const labelY = mid.y + labelOffsetY;

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
          transform={`translate(${mid.x}, ${mid.y}) rotate(${arrowAngle})`}
          style={{ pointerEvents: "none" }}
        />
      )}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
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

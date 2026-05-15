import ReactFlow, {
  Background,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { useDiagramStore } from "../state/diagram";
import { ParticleEdge } from "./edges/ParticleEdge";
import { ExternalLegNode } from "./nodes/ExternalLeg";
import { VertexNode } from "./nodes/VertexNode";

const nodeTypes: NodeTypes = { vertex: VertexNode, externalLeg: ExternalLegNode };
const edgeTypes: EdgeTypes = { particle: ParticleEdge };

/** Read-only preview of the current diagram. Used in the Export view above
 *  the .dot text so the user sees what's being exported.
 *  - No selection, no drag, no delete, no panning beyond fitView
 *  - Reads the same store as the main canvas
 */
function PreviewInner() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const externalLegs = useDiagramStore((s) => s.externalLegs);

  const rfNodes: Node[] = nodes.map((n) => {
    const leg = externalLegs.find((l) => l.nodeId === n.id);
    if (leg) {
      return {
        id: n.id,
        type: "externalLeg",
        position: { x: n.position[0], y: n.position[1] },
        data: { kind: leg.kind, label: leg.label },
        draggable: false,
        selectable: false,
      };
    }
    return {
      id: n.id,
      type: "vertex",
      position: { x: n.position[0], y: n.position[1] },
      data: {},
      draggable: false,
      selectable: false,
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: "particle",
    data: { particlePdgId: e.particlePdgId },
    selectable: false,
  }));

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesConnectable={false}
      nodesDraggable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      <Background />
    </ReactFlow>
  );
}

export function DiagramPreview({ height = 280 }: { height?: number }) {
  return (
    <div
      data-testid="diagram-preview"
      style={{
        height,
        border: "1px solid #ddd",
        borderRadius: 4,
        background: "white",
      }}
    >
      <ReactFlowProvider>
        <PreviewInner />
      </ReactFlowProvider>
    </div>
  );
}

import { useCallback } from "react";
import ReactFlow, {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { useDiagramStore } from "../state/diagram";
import { ParticleEdge } from "./edges/ParticleEdge";
import { ExternalLegNode } from "./nodes/ExternalLeg";
import { VertexNode } from "./nodes/VertexNode";

const nodeTypes: NodeTypes = { vertex: VertexNode, externalLeg: ExternalLegNode };
const edgeTypes: EdgeTypes = { particle: ParticleEdge };

export function DiagramCanvas() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const externalLegs = useDiagramStore((s) => s.externalLegs);
  const addEdgeFn = useDiagramStore((s) => s.addEdge);

  const rfNodes: Node[] = nodes.map((n) => {
    const leg = externalLegs.find((l) => l.nodeId === n.id);
    if (leg) {
      return {
        id: n.id,
        type: "externalLeg",
        position: { x: n.position[0], y: n.position[1] },
        data: { kind: leg.kind, label: leg.label },
      };
    }
    return {
      id: n.id,
      type: "vertex",
      position: { x: n.position[0], y: n.position[1] },
      data: {},
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: "particle",
    data: { particlePdgId: e.particlePdgId },
  }));

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const id = `e${Date.now()}`;
      addEdgeFn({ id, sourceNodeId: c.source, targetNodeId: c.target });
    },
    [addEdgeFn],
  );

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

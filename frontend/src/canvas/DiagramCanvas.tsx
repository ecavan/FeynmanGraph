import { useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useDiagramStore } from "../state/diagram";
import { ParticleEdge } from "./edges/ParticleEdge";
import { ExternalLegNode } from "./nodes/ExternalLeg";
import { VertexNode } from "./nodes/VertexNode";

const nodeTypes: NodeTypes = { vertex: VertexNode, externalLeg: ExternalLegNode };
const edgeTypes: EdgeTypes = { particle: ParticleEdge };

function DiagramCanvasInner() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const externalLegs = useDiagramStore((s) => s.externalLegs);
  const selectedId = useDiagramStore((s) => s.selectedId);
  const selectedKind = useDiagramStore((s) => s.selectedKind);
  const removeVertex = useDiagramStore((s) => s.removeVertex);
  const removeEdge = useDiagramStore((s) => s.removeEdge);
  const updateVertexPosition = useDiagramStore((s) => s.updateVertexPosition);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const edgeDraftActive = useDiagramStore((s) => s.edgeDraftActive);
  const edgeDraftSource = useDiagramStore((s) => s.edgeDraftSource);
  const pickEdgeDraftVertex = useDiagramStore((s) => s.pickEdgeDraftVertex);
  const cancelEdgeDraft = useDiagramStore((s) => s.cancelEdgeDraft);

  const rf = useReactFlow();

  // fitView on an empty graph produces NaN dimensions react-flow can't render.
  useEffect(() => {
    if (nodes.length === 0) return;
    const t = setTimeout(() => rf.fitView({ padding: 0.25, duration: 200 }), 60);
    return () => clearTimeout(t);
  }, [nodes.length, edges.length, externalLegs.length, rf.fitView]);

  const rfNodes: Node[] = nodes.map((n) => {
    const leg = externalLegs.find((l) => l.nodeId === n.id);
    const isSelected = selectedKind === "node" && selectedId === n.id;
    const isDraftSource = edgeDraftActive && edgeDraftSource === n.id;
    if (leg) {
      return {
        id: n.id,
        type: "externalLeg",
        position: { x: n.position[0], y: n.position[1] },
        selected: isSelected,
        data: { kind: leg.kind, label: leg.label, draftSource: isDraftSource },
      };
    }
    return {
      id: n.id,
      type: "vertex",
      position: { x: n.position[0], y: n.position[1] },
      selected: isSelected,
      data: { draftSource: isDraftSource },
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: "particle",
    selected: selectedKind === "edge" && selectedId === e.id,
    data: { particlePdgId: e.particlePdgId },
  }));

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position && change.dragging === false) {
          updateVertexPosition(change.id, [change.position.x, change.position.y]);
        }
      }
    },
    [updateVertexPosition],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const n of deleted) removeVertex(n.id);
    },
    [removeVertex],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) removeEdge(e.id);
    },
    [removeEdge],
  );

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_, node) => {
          if (edgeDraftActive) pickEdgeDraftVertex(node.id);
          else setSelection(node.id, "node");
        }}
        onEdgeClick={(_, edge) => {
          if (edgeDraftActive) cancelEdgeDraft();
          setSelection(edge.id, "edge");
        }}
        onPaneClick={() => {
          if (edgeDraftActive) cancelEdgeDraft();
          else setSelection(null, null);
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        nodesConnectable={false}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function DiagramCanvas() {
  return (
    <ReactFlowProvider>
      <DiagramCanvasInner />
    </ReactFlowProvider>
  );
}

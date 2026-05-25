import type { ExampleSpec } from "../api/types";
import { useDiagramStore } from "./diagram";

// Bulk-write topology so layout runs once, not per addVertex/addEdge.
export function loadGraphIntoStore(spec: ExampleSpec): void {
  const before = useDiagramStore.getState();
  // gammaloop output for "qed" requests can include EW particles in loops; widen
  // the canvas theory so the issues panel doesn't flag legitimate generated diagrams.
  const permissiveTheory = spec.model_id === "sm" ? "sm" : "ufo";
  useDiagramStore.setState({
    modelId: spec.model_id,
    theoryId: permissiveTheory,
    processName: spec.process_name,
    nodes: spec.nodes.map((n) => ({
      id: n.id,
      position: n.position,
      ufoVertexId: n.ufo_vertex_id ?? undefined,
    })),
    edges: spec.edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.source_node_id,
      targetNodeId: e.target_node_id,
      particlePdgId: e.particle_pdg_id,
      cutLabel: e.cut_label ?? null,
    })),
    externalLegs: spec.external_legs.map((leg) => ({
      nodeId: leg.node_id,
      kind: leg.kind,
      label: leg.label,
    })),
    lmbEdgeIds: null,
    selectedId: null,
    selectedKind: null,
    _past: [
      ...before._past,
      {
        nodes: before.nodes,
        edges: before.edges,
        externalLegs: before.externalLegs,
        lmbEdgeIds: before.lmbEdgeIds,
      },
    ].slice(-50),
    _future: [],
  });
  useDiagramStore.getState().runLayout();
}

import type { DiagramState } from "../state/diagram";

export function serializeGraphSpec(state: DiagramState) {
  return {
    model_id: state.modelId,
    theory_id: state.theoryId,
    process_name: state.processName,
    nodes: state.nodes.map((n) => ({
      id: n.id,
      position: n.position,
      ufo_vertex_id: n.ufoVertexId ?? null,
    })),
    edges: state.edges.map((e) => ({
      id: e.id,
      source_node_id: e.sourceNodeId,
      target_node_id: e.targetNodeId,
      particle_pdg_id: e.particlePdgId,
      direction: "source_to_target" as const,
      cut_label: e.cutLabel ?? null,
    })),
    external_legs: state.externalLegs.map((l) => ({
      node_id: l.nodeId,
      kind: l.kind,
      label: l.label,
    })),
    lmb_edge_ids: state.lmbEdgeIds,
  };
}

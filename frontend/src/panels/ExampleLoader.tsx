import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { ExampleMeta, ExampleSpec } from "../api/types";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

// Bulk-write topology so layout runs once, not per addVertex/addEdge.
export function loadExampleIntoStore(spec: ExampleSpec): void {
  const before = useDiagramStore.getState();
  useDiagramStore.setState({
    modelId: spec.model_id,
    theoryId: spec.theory_id,
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

export function ExampleLoader() {
  const [examples, setExamples] = useState<ExampleMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listExamples()
      .then(setExamples)
      .catch((e) => setError(String(e)));
  }, []);

  async function load(id: string) {
    setError(null);
    try {
      const spec = await api.getExample(id);
      loadExampleIntoStore(spec);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <h3>Starter examples</h3>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {examples.map((ex) => (
          <li key={ex.id} style={{ padding: "2px 0" }}>
            <button
              type="button"
              onClick={() => load(ex.id)}
              style={{ padding: "4px 8px", cursor: "pointer" }}
            >
              Load: {ex.process_name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

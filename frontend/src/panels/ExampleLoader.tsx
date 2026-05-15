import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { ExampleMeta, ExampleSpec } from "../api/types";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

/** Load a wire-format ExampleSpec into the zustand store. */
export function loadExampleIntoStore(spec: ExampleSpec): void {
  const s = useDiagramStore.getState();
  s.reset();
  s.setModelId(spec.model_id);
  s.setTheoryId(spec.theory_id);
  s.setProcessName(spec.process_name);
  for (const n of spec.nodes) {
    s.addVertex({
      id: n.id,
      position: n.position,
      ufoVertexId: n.ufo_vertex_id ?? undefined,
    });
  }
  for (const e of spec.edges) {
    s.addEdge({
      id: e.id,
      sourceNodeId: e.source_node_id,
      targetNodeId: e.target_node_id,
      particlePdgId: e.particle_pdg_id,
    });
  }
  for (const leg of spec.external_legs) {
    s.addExternalLeg({ nodeId: leg.node_id, kind: leg.kind, label: leg.label });
  }
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

import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "../api/client";
import type { TheoryMeta } from "../api/types";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

export function TheoryPicker() {
  const [theories, setTheories] = useState<TheoryMeta[]>([]);
  const theoryId = useDiagramStore((s) => s.theoryId);
  const modelId = useDiagramStore((s) => s.modelId);
  const setTheoryId = useDiagramStore((s) => s.setTheoryId);

  useEffect(() => {
    api
      .listTheories()
      .then(setTheories)
      .catch(() => setTheories([]));
  }, []);

  const visibleTheories = useMemo(
    () => (modelId === "sm" ? theories.filter((t) => t.id !== "ufo") : theories),
    [theories, modelId],
  );

  return (
    <section>
      <h3 style={{ margin: "0 0 4px 0" }}>Theory restriction</h3>
      <select
        value={theoryId}
        onChange={(e) => setTheoryId(e.target.value)}
        style={{ width: "100%", padding: "4px 6px", fontSize: 13 }}
      >
        {visibleTheories.length === 0 && <option value="qed">QED (loading…)</option>}
        {visibleTheories.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <p style={{ fontSize: 11, opacity: 0.6, margin: "4px 0 0" }}>
        Which subset of vertices to allow. Picking <em>QED</em> flags QCD edges
        as illegal in the issues panel.
      </p>
    </section>
  );
}

import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { TheoryMeta } from "../api/types";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

export function TheoryPicker() {
  const [theories, setTheories] = useState<TheoryMeta[]>([]);
  const theoryId = useDiagramStore((s) => s.theoryId);
  const setTheoryId = useDiagramStore((s) => s.setTheoryId);

  useEffect(() => {
    api
      .listTheories()
      .then(setTheories)
      .catch(() => setTheories([]));
  }, []);

  return (
    <section>
      <h3>Theory</h3>
      <select value={theoryId} onChange={(e) => setTheoryId(e.target.value)}>
        {theories.length === 0 && <option value="qed">QED (loading...)</option>}
        {theories.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </section>
  );
}

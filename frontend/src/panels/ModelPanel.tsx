import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { ModelMeta } from "../api/types";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

export function ModelPanel() {
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const modelId = useDiagramStore((s) => s.modelId);
  const setModelId = useDiagramStore((s) => s.setModelId);

  useEffect(() => {
    api
      .listModels()
      .then(setModels)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <section>
      <h3>UFO model</h3>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {models.length === 0 && !error && <p style={{ opacity: 0.6 }}>No models available.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {models.map((m) => (
          <li key={m.id}>
            <label>
              <input
                type="radio"
                name="model"
                checked={modelId === m.id}
                onChange={() => setModelId(m.id)}
              />{" "}
              {m.name}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

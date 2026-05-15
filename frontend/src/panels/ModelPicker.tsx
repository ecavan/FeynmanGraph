import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { ModelMeta } from "../api/types";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

/** Radio list of available models (built-in + previously uploaded). */
export function ModelPicker() {
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
      <h3>Model</h3>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {models.length === 0 && !error && (
        <p style={{ opacity: 0.6 }}>
          No models available. <a href="#" onClick={(e) => e.preventDefault()}>Use the Import tab</a>{" "}
          to upload a UFO directory.
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {models.map((m) => (
          <li key={m.id} style={{ padding: "2px 0" }}>
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

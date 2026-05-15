import { useEffect, useRef, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import type { ModelMeta } from "../api/types";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

export function ModelPanel() {
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelId = useDiagramStore((s) => s.modelId);
  const setModelId = useDiagramStore((s) => s.setModelId);

  function refresh() {
    setError(null);
    api
      .listModels()
      .then(setModels)
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadStatus(`Uploading ${file.name}...`);
    setError(null);
    try {
      const result = await api.uploadUfo(file);
      setUploadStatus(
        `Uploaded ${result.name} (${result.particles} particles, ${result.vertices} vertices)`,
      );
      refresh();
      setModelId(result.id);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`);
      } else {
        setError(String(e));
      }
      setUploadStatus(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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
      <div style={{ marginTop: 8, padding: 8, background: "#f6f6f6", borderRadius: 4 }}>
        <strong>Upload UFO (BSM)</strong>
        <p style={{ fontSize: 12, opacity: 0.7, margin: "4px 0" }}>
          Zip or tar.gz of a UFO model directory. <em>Local-only: uploads execute Python.</em>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.tar.gz,.tgz,application/zip,application/gzip"
          onChange={handleUpload}
        />
        {uploadStatus && <p style={{ fontSize: 12, marginTop: 4 }}>{uploadStatus}</p>}
      </div>
    </section>
  );
}

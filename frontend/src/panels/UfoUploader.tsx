import { useRef, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

export function UfoUploader(props: { onUploaded?: () => void } = {}) {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const setModelId = useDiagramStore((s) => s.setModelId);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadStatus(`Uploading ${file.name}…`);
    setError(null);
    try {
      const result = await api.uploadUfo(file);
      setUploadStatus(
        `Uploaded ${result.name}: ${result.particles} particles, ${result.vertices} vertices`,
      );
      setModelId(result.id);
      props.onUploaded?.();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}${e.hint ? ` — ${e.hint}` : ""}`);
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
      <h3>Import a UFO model (BSM)</h3>
      <p style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 540 }}>
        Upload a zip or tar.gz archive containing a UFO model directory
        (<code>particles.py</code> at the root or one level deep). The server
        runs the model's Python files in an isolated subprocess and converts
        it to feyngraph's internal schema.
      </p>
      <p style={{ fontSize: 12, color: "#a85b00", maxWidth: 540 }}>
        Local-only safety: uploads execute Python. Don't expose feyngraph over a
        public network without sandboxing.
      </p>
      <div style={{ padding: 10, background: "#f7f7f7", borderRadius: 6, maxWidth: 540 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.tar.gz,.tgz,application/zip,application/gzip"
          onChange={handleUpload}
        />
        {uploadStatus && (
          <p style={{ fontSize: 12, color: "#0a6e2f", marginTop: 6 }}>{uploadStatus}</p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: "#c00", marginTop: 6 }}>{error}</p>
        )}
      </div>
    </section>
  );
}

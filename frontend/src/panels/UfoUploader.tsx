import { useRef, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

export function UfoUploader(props: { onUploaded?: () => void } = {}) {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const setModelId = useDiagramStore((s) => s.setModelId);
  const setTheoryId = useDiagramStore((s) => s.setTheoryId);

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
      setTheoryId("ufo");
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
      <h3 style={{ margin: "0 0 6px 0" }}>Import a UFO model</h3>
      <p style={{ fontSize: 12, lineHeight: 1.45, margin: "0 0 6px 0", opacity: 0.85 }}>
        Accepted: <strong>.zip</strong> or <strong>.tar.gz</strong> with{" "}
        <code>particles.py</code> at the root or one directory level deep.
      </p>
      <p
        data-testid="ufo-safety-warning"
        style={{
          fontSize: 11,
          color: "#a85b00",
          background: "#fff8eb",
          border: "1px solid #f0d28a",
          borderRadius: 4,
          padding: "4px 6px",
          margin: "0 0 8px 0",
        }}
      >
        ⚠ Uploads execute Python on the server. Local use only — do not expose
        feyngraph on a public network without sandboxing.
      </p>
      <div style={{ padding: 8, background: "#f7f7f7", borderRadius: 4 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.tar.gz,.tgz,application/zip,application/gzip"
          onChange={handleUpload}
        />
        {uploadStatus && (
          <p style={{ fontSize: 12, color: "#0a6e2f", margin: "6px 0 0" }}>{uploadStatus}</p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: "#c00", margin: "6px 0 0" }}>{error}</p>
        )}
      </div>
    </section>
  );
}

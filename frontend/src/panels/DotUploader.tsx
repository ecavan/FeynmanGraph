import { useRef, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { loadGraphIntoStore } from "../state/loadGraph";

const api = new ApiClient();

export function DotUploader(props: { onImported?: () => void } = {}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelId = useDiagramStore((s) => s.modelId);
  const theoryId = useDiagramStore((s) => s.theoryId);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus(`Parsing ${file.name}…`);
    setError(null);
    try {
      const spec = await api.importDot(file, modelId || "sm", theoryId || "sm");
      loadGraphIntoStore(spec);
      setStatus(`Loaded ${spec.process_name}: ${spec.edges.length} edges, ${spec.nodes.length} nodes`);
      props.onImported?.();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}${e.hint ? ` — ${e.hint}` : ""}`);
      } else {
        setError(String(e));
      }
      setStatus(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section data-testid="dot-uploader">
      <h3 style={{ margin: "0 0 6px 0" }}>Import a .dot graph</h3>
      <p style={{ fontSize: 12, lineHeight: 1.45, margin: "0 0 8px 0", opacity: 0.85 }}>
        Accepted: any gammaloop-format <code>.dot</code> file. Loads onto the canvas using the currently-selected model.
      </p>
      <div style={{ padding: 8, background: "#f7f7f7", borderRadius: 4 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".dot,.gv,text/plain"
          onChange={handleUpload}
        />
        {status && <p style={{ fontSize: 12, color: "#0a6e2f", margin: "6px 0 0" }}>{status}</p>}
        {error && <p style={{ fontSize: 12, color: "#c00", margin: "6px 0 0" }}>{error}</p>}
      </div>
    </section>
  );
}

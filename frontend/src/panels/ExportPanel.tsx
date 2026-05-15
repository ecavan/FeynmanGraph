import { useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

export function ExportPanel() {
  const [dot, setDot] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const state = useDiagramStore();

  async function doExport() {
    setError(null);
    setDot("");
    try {
      const spec = serializeGraphSpec(state);
      const resp = await api.exportDot(spec);
      setDot(resp.dot);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`);
      } else {
        setError(String(e));
      }
    }
  }

  function download() {
    const blob = new Blob([dot], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.processName}.dot`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div data-testid="export-panel">
      <button type="button" onClick={doExport}>
        Export .dot
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {dot && (
        <>
          <button type="button" onClick={download} style={{ marginLeft: 8 }}>
            Download {state.processName}.dot
          </button>
          <pre
            style={{
              background: "#f6f6f6",
              padding: 8,
              maxHeight: 400,
              overflow: "auto",
              marginTop: 8,
            }}
          >
            {dot}
          </pre>
        </>
      )}
    </div>
  );
}

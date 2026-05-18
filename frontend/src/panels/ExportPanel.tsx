import { useEffect, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

export function ExportPanel(props: { openTick?: number } = {}) {
  const [dot, setDot] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const processName = useDiagramStore((s) => s.processName);
  const nodeCount = useDiagramStore((s) => s.nodes.length);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Pre-check: if the canvas is empty, skip the API call entirely and
    // show a friendly hint instead of triggering NO_EXTERNAL_LEGS.
    if (nodeCount === 0) {
      setDot("");
      setWarnings([]);
      return;
    }
    (async () => {
      try {
        const spec = serializeGraphSpec(useDiagramStore.getState());
        const resp = await api.exportDot(spec);
        if (cancelled) return;
        setDot(resp.dot);
        setWarnings(resp.warnings ?? []);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) {
          setError(`${e.code}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`);
        } else {
          setError(String(e));
        }
        setDot("");
        setWarnings([]);
      }
    })();
    return () => { cancelled = true; };
  }, [props.openTick, nodeCount]);

  function download() {
    const blob = new Blob([dot], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${processName}.dot`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div data-testid="export-panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {nodeCount === 0 && !error && (
        <div
          data-testid="export-empty"
          style={{
            background: "#f0f4ff",
            border: "1px solid #b0c4ef",
            color: "#234ea3",
            padding: "8px 10px",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          Nothing to export yet — add a vertex and a propagator first.
        </div>
      )}

      {dot && (
        <div>
          <button
            type="button"
            onClick={download}
            style={{
              padding: "6px 14px",
              background: "#0066ff",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Download {processName}.dot
          </button>
        </div>
      )}

      {error && (
        <div
          data-testid="export-error"
          style={{
            background: "#fde2e1",
            border: "1px solid #c0392b",
            color: "#7a1c12",
            padding: "8px 10px",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          data-testid="export-warnings"
          style={{
            background: "#fff5d6",
            border: "1px solid #c89500",
            color: "#5a4400",
            padding: "8px 10px",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <strong>Warnings ({warnings.length}):</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {dot && (
        <pre
          data-testid="export-dot"
          style={{
            background: "#f6f6f6",
            padding: 10,
            maxHeight: 480,
            overflow: "auto",
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            border: "1px solid #ddd",
            borderRadius: 4,
            margin: 0,
          }}
        >
          {dot}
        </pre>
      )}
    </div>
  );
}

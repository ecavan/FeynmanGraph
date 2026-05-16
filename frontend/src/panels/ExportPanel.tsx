import { useEffect, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

export function ExportPanel() {
  const [dot, setDot] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const processName = useDiagramStore((s) => s.processName);

  useEffect(() => {
    let cancelled = false;
    setError(null);
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
  }, []);

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

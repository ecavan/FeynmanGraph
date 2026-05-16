import { useCallback, useEffect, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

export function ExportPanel() {
  const [dot, setDot] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<boolean>(false);
  const state = useDiagramStore();

  const doExport = useCallback(async () => {
    setError(null);
    setStale(false);
    try {
      const spec = serializeGraphSpec(useDiagramStore.getState());
      const resp = await api.exportDot(spec);
      setDot(resp.dot);
      setWarnings(resp.warnings ?? []);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`);
      } else {
        setError(String(e));
      }
      setDot("");
      setWarnings([]);
    }
  }, []);

  useEffect(() => {
    doExport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dot) setStale(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nodes, state.edges, state.externalLegs, state.modelId, state.theoryId, state.lmbEdgeIds]);

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
    <div data-testid="export-panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={doExport}
          style={{
            padding: "6px 14px",
            background: stale ? "#0066ff" : "white",
            color: stale ? "white" : "#222",
            border: "1px solid #0066ff",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {dot ? "Re-export .dot" : "Export .dot"}
        </button>
        {dot && (
          <button
            type="button"
            onClick={download}
            style={{
              padding: "6px 14px",
              background: "white",
              color: "#222",
              border: "1px solid #999",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Download {state.processName}.dot
          </button>
        )}
        {stale && dot && (
          <span style={{ fontSize: 12, color: "#a85b00" }}>
            Diagram changed — click "Re-export .dot" to refresh.
          </span>
        )}
      </div>

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

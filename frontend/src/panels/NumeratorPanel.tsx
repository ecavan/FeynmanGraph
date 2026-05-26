import { useRef, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";
import { TypstMath } from "./TypstMath";

const api = new ApiClient();

export function NumeratorPanel() {
  const state = useDiagramStore();
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const empty = state.nodes.length === 0;

  async function load() {
    setBusy(true);
    setError(null);
    setRaw(null);
    setElapsed(0);
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const spec = serializeGraphSpec(state) as unknown as Parameters<typeof api.getNumerator>[0];
      const resp = await api.getNumerator(spec, controller.signal);
      setRaw(resp.raw);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}${e.hint ? ` — ${e.hint}` : ""}`);
      } else {
        setError(String(e));
      }
    } finally {
      clearInterval(tick);
      controllerRef.current = null;
      setBusy(false);
    }
  }

  function cancel() {
    controllerRef.current?.abort();
  }

  return (
    <div data-testid="numerator-panel">
      <h4 style={{ margin: "0 0 6px" }}>Numerator</h4>
      {empty ? (
        <p style={{ fontSize: 12, opacity: 0.55 }}>Build or load a diagram first.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <button
              type="button"
              data-testid="numerator-load"
              onClick={load}
              disabled={busy}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                background: busy ? "#aaa" : "#0066ff",
                color: "white",
                border: "none",
                borderRadius: 3,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy
                ? `Computing… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                : raw
                ? "Recompute"
                : "Load numerator"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={cancel}
                style={{ padding: "3px 8px", fontSize: 12 }}
              >
                ✕ Cancel
              </button>
            )}
            {!busy && raw && (
              <button
                type="button"
                data-testid="numerator-clear"
                onClick={() => { setRaw(null); setError(null); setShowSource(false); }}
                style={{ padding: "3px 8px", fontSize: 12 }}
              >
                ✕ Clear
              </button>
            )}
          </div>
          {error && (
            <div
              style={{
                marginBottom: 8,
                padding: "6px 8px",
                background: "#fde2e1",
                border: "1px solid #c0392b",
                color: "#7a1c12",
                borderRadius: 3,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
          {raw && (
            <>
              <TypstMath source={raw} />
              <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  data-testid="numerator-toggle-source"
                  onClick={() => setShowSource((s) => !s)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    background: "white",
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    cursor: "pointer",
                    opacity: 0.7,
                  }}
                >
                  {showSource ? "Hide source" : "Show source (Typst)"}
                </button>
              </div>
              {showSource && (
                <pre
                  data-testid="numerator-text"
                  style={{
                    margin: "6px 0 0",
                    padding: "8px 10px",
                    background: "#f7f7f7",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    fontSize: 11,
                    lineHeight: 1.4,
                    maxHeight: 240,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {raw}
                </pre>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

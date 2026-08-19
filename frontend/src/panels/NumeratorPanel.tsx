import { useRef, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { TypstMath } from "./TypstMath";
import {
  buildIntegrandTypst,
  lmbRepToTypst,
  propagatorsFromState,
} from "./integrand";
import { reduceLoopGuard, reduceReasonMessage } from "./reduceGuard";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

export function NumeratorPanel() {
  const state = useDiagramStore();
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const [view, setView] = useState<"numerator" | "integrand">("numerator");
  const [propagators, setPropagators] = useState<
    { momentum: string; particle: string }[]
  >([]);
  const controllerRef = useRef<AbortController | null>(null);
  const [reduced, setReduced] = useState<string | null>(null);
  const [reducing, setReducing] = useState(false);
  const [reduceError, setReduceError] = useState<string | null>(null);
  const [reduceWarning, setReduceWarning] = useState<string | null>(null);
  const [reduceElapsed, setReduceElapsed] = useState(0);
  const reduceControllerRef = useRef<AbortController | null>(null);

  const empty = state.nodes.length === 0;

  async function load() {
    setBusy(true);
    setError(null);
    setRaw(null);
    setPropagators([]);
    setElapsed(0);
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const spec = serializeGraphSpec(state) as unknown as Parameters<
        typeof api.getNumerator
      >[0];
      const resp = await api.getNumerator(spec, controller.signal);
      setRaw(resp.raw);
      setPropagators(resp.propagators ?? []);
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

  async function reduce() {
    setReduceError(null);
    setReduced(null);
    setReduceWarning(null);
    setReducing(true);
    setReduceElapsed(0);
    const tick = setInterval(() => setReduceElapsed((e) => e + 1), 1000);
    const controller = new AbortController();
    reduceControllerRef.current = controller;
    try {
      const spec = serializeGraphSpec(state) as unknown as Parameters<
        typeof api.getReduce
      >[0];
      // The one-loop reducer only handles single-loop diagrams — check the loop
      // count up front and warn, instead of round-tripping to a backend error.
      const { loop_count } = await api.validateGraph(spec);
      const guard = reduceLoopGuard(loop_count);
      if (guard) {
        setReduceWarning(guard);
        return;
      }
      const resp = await api.getReduce(spec, controller.signal);
      // A one-loop diagram may still not reduce (e.g. its numerator vanishes);
      // the backend flags that with a status we surface as a warning, not an error.
      const reasonMsg = reduceReasonMessage(resp.reason);
      if (reasonMsg) {
        setReduceWarning(reasonMsg);
      } else {
        setReduced(resp.raw);
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (e instanceof ApiError) {
        setReduceError(
          `${e.code}: ${e.message}${e.hint ? ` — ${e.hint}` : ""}`,
        );
      } else {
        setReduceError(String(e));
      }
    } finally {
      clearInterval(tick);
      reduceControllerRef.current = null;
      setReducing(false);
    }
  }

  // Prefer the real per-propagator momenta gammaloop returns (lmb_rep), resolving
  // each mass from the model by particle name; fall back to schematic q_i momenta.
  const integrandProps =
    propagators.length > 0
      ? propagators.map((p) => ({
          momentum: lmbRepToTypst(p.momentum),
          mass:
            state.cachedModel?.particles.find((pp) => pp.name === p.particle)
              ?.mass ?? "ZERO",
        }))
      : propagatorsFromState(
          state.edges,
          state.externalLegs,
          state.cachedModel,
        );

  const displaySource =
    raw == null
      ? null
      : view === "integrand"
        ? buildIntegrandTypst(raw, integrandProps)
        : raw;

  return (
    <div data-testid="numerator-panel">
      <h4 style={{ margin: "0 0 6px" }}>Numerator</h4>
      {empty ? (
        <p style={{ fontSize: 12, opacity: 0.55 }}>
          Build or load a diagram first.
        </p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
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
                onClick={() => {
                  setRaw(null);
                  setPropagators([]);
                  setError(null);
                  setShowSource(false);
                  setReduced(null);
                  setReduceError(null);
                  setReduceWarning(null);
                }}
                style={{ padding: "3px 8px", fontSize: 12 }}
              >
                ✕ Clear
              </button>
            )}
            <button
              type="button"
              data-testid="reduce-load"
              onClick={reduce}
              disabled={reducing}
              title="Reduce the one-loop numerator to scalar master integrals (A0/B0/C0/D0)"
              style={{
                padding: "4px 10px",
                fontSize: 12,
                background: reducing ? "#aaa" : "#7a3cff",
                color: "white",
                border: "none",
                borderRadius: 3,
                cursor: reducing ? "wait" : "pointer",
              }}
            >
              {reducing
                ? `Reducing… ${Math.floor(reduceElapsed / 60)}:${String(reduceElapsed % 60).padStart(2, "0")}`
                : reduced
                  ? "Re-reduce"
                  : "Reduce to masters"}
            </button>
            {reducing && (
              <button
                type="button"
                onClick={() => reduceControllerRef.current?.abort()}
                style={{ padding: "3px 8px", fontSize: 12 }}
              >
                ✕ Cancel
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
          {displaySource && (
            <>
              <div
                data-testid="numerator-view-toggle"
                style={{ display: "flex", gap: 6, marginBottom: 6 }}
              >
                <ViewButton
                  active={view === "numerator"}
                  label="Numerator"
                  onClick={() => setView("numerator")}
                />
                <ViewButton
                  active={view === "integrand"}
                  label="Full integral"
                  onClick={() => setView("integrand")}
                />
              </div>
              <TypstMath source={displaySource} />
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
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
                  {displaySource}
                </pre>
              )}
            </>
          )}
          {(reduceError || reduceWarning || reduced) && (
            <div
              data-testid="reduce-result"
              style={{
                marginTop: 12,
                borderTop: "1px solid #e0e0e0",
                paddingTop: 10,
              }}
            >
              <h4 style={{ margin: "0 0 6px" }}>Reduction — master integrals</h4>
              {reduceWarning && (
                <div
                  data-testid="reduce-warning"
                  style={{
                    padding: "6px 8px",
                    background: "#fff3cd",
                    border: "1px solid #d9a400",
                    color: "#7a5d00",
                    borderRadius: 3,
                    fontSize: 12,
                  }}
                >
                  {reduceWarning}
                </div>
              )}
              {reduceError && (
                <div
                  style={{
                    padding: "6px 8px",
                    background: "#fde2e1",
                    border: "1px solid #c0392b",
                    color: "#7a1c12",
                    borderRadius: 3,
                    fontSize: 12,
                  }}
                >
                  {reduceError}
                </div>
              )}
              {reduced && (
                <>
                  <TypstMath source={reduced} />
                  <pre
                    data-testid="reduce-text"
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
                    {reduced}
                  </pre>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ViewButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: "3px 10px",
        fontSize: 12,
        background: props.active ? "#0066ff" : "white",
        color: props.active ? "white" : "#222",
        border: "1px solid #888",
        borderRadius: 3,
        cursor: "pointer",
      }}
    >
      {props.label}
    </button>
  );
}

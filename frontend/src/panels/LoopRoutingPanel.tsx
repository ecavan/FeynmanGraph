import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

export function LoopRoutingPanel() {
  const [chordIds, setChordIds] = useState<string[]>([]);
  const [loopCount, setLoopCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const state = useDiagramStore();
  const setLmbEdgeIds = useDiagramStore((s) => s.setLmbEdgeIds);

  useEffect(() => {
    if (!state.modelId) {
      setChordIds([]);
      setLoopCount(0);
      return;
    }
    const spec = serializeGraphSpec(state);
    api
      .validateGraph(spec)
      .then((resp) => {
        setChordIds(resp.chord_edge_ids);
        setLoopCount(resp.loop_count);
        const lmbIssue = resp.issues.find((i) => i.code === "INVALID_LMB_OVERRIDE");
        setOverrideError(lmbIssue?.detail ?? null);
      })
      .catch(() => {
        setChordIds([]);
        setLoopCount(0);
        setOverrideError(null);
      });
  }, [
    state.modelId,
    state.theoryId,
    state.nodes,
    state.edges,
    state.externalLegs,
    state.lmbEdgeIds,
  ]);

  const isOverridden = state.lmbEdgeIds !== null && state.lmbEdgeIds.length > 0;

  if (loopCount === 0) {
    return (
      <div data-testid="loop-routing-panel">
        <h4>
          Loops
          <span style={{ fontWeight: "normal", opacity: 0.6, marginLeft: 6 }}>
            (0)
          </span>
        </h4>
      </div>
    );
  }

  function applyDraft() {
    setOverrideError(null);
    const ids = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      setLmbEdgeIds(null);
      setDraft("");
    } else {
      setLmbEdgeIds(ids);
    }
  }

  function clearOverride() {
    setLmbEdgeIds(null);
    setDraft("");
    setOverrideError(null);
  }

  return (
    <div data-testid="loop-routing-panel">
      <h4>
        Loop momentum routing
        <span
          style={{
            fontWeight: 600,
            marginLeft: 6,
            padding: "1px 6px",
            background: loopCount >= 2 ? "#fff3cd" : "#e6f0ff",
            color: loopCount >= 2 ? "#7a5d00" : "#0044aa",
            borderRadius: 10,
            fontSize: 11,
          }}
        >
          {loopCount} loop{loopCount === 1 ? "" : "s"}
        </span>
      </h4>
      <p style={{ fontSize: 12, margin: "4px 0" }}>
        Chord edges (one loop momentum each):
      </p>
      <p style={{ fontFamily: "monospace", fontSize: 12, margin: "2px 0 8px 0" }}>
        {chordIds.length > 0 ? chordIds.join(", ") : "(none)"}
        {isOverridden && (
          <span style={{ color: "#06c", marginLeft: 6 }}>(user override)</span>
        )}
      </p>
      <div>
        <input
          type="text"
          placeholder="comma-separated edge IDs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ width: "70%", padding: "2px 4px", fontSize: 12, fontFamily: "monospace" }}
        />
        <button type="button" onClick={applyDraft} style={{ marginLeft: 4 }}>
          Apply
        </button>
        {isOverridden && (
          <button type="button" onClick={clearOverride} style={{ marginLeft: 4 }}>
            Reset
          </button>
        )}
      </div>
      {overrideError && (
        <p style={{ color: "red", fontSize: 12, marginTop: 4 }}>{overrideError}</p>
      )}
    </div>
  );
}

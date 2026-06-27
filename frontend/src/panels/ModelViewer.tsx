import { useEffect, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import type { TheoryMeta } from "../api/types";
import { useDiagramStore } from "../state/diagram";
import { filterModel, vertexParticleNames } from "./modelView";

const api = new ApiClient();
// Read-only commands that return clean output against a freshly-imported model.
// (display settings/quantities panic without a generated process, so they're omitted.)
const EXAMPLES = ["display model", "display processes", "display integrand"];

type Props = {
  expanded?: boolean;
  onToggleExpand?: () => void;
};

export function ModelViewer({ expanded = false, onToggleExpand }: Props) {
  const model = useDiagramStore((s) => s.cachedModel);
  const theoryId = useDiagramStore((s) => s.theoryId);
  const setTheoryId = useDiagramStore((s) => s.setTheoryId);
  const [theories, setTheories] = useState<TheoryMeta[]>([]);
  const [query, setQuery] = useState("");
  const [cmd, setCmd] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listTheories()
      .then(setTheories)
      .catch(() => setTheories([]));
  }, []);

  async function runCmd(command?: string) {
    const c = (command ?? cmd).trim();
    if (!model || !c) return;
    setCmd(c);
    setBusy(true);
    try {
      const resp = await api.runModelCommand(model.id, c);
      setOutput(resp.output);
    } catch (e) {
      setOutput(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!model) {
    return (
      <div data-testid="model-viewer" style={{ fontSize: 13, opacity: 0.6 }}>
        No model loaded.
      </div>
    );
  }

  const { particles, vertices } = filterModel(model, query);
  const listHeight = expanded ? 260 : 150;

  return (
    <div data-testid="model-viewer" style={{ fontSize: 13 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <strong style={{ fontSize: 14 }}>gammaloop CLI</strong>
          <span style={{ opacity: 0.55, marginLeft: 6 }}>
            {model.name} ({model.id})
          </span>
        </div>
        {onToggleExpand && (
          <button
            type="button"
            data-testid="model-expand"
            onClick={onToggleExpand}
            title={expanded ? "Collapse" : "Expand"}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "white",
              cursor: "pointer",
            }}
          >
            {expanded ? "⤡ Collapse" : "⤢ Expand"}
          </button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span style={{ opacity: 0.6 }}>Theory</span>
        <select
          data-testid="model-theory"
          value={theoryId}
          onChange={(e) => setTheoryId(e.target.value)}
          style={{ flex: 1, padding: "3px 6px", fontSize: 12 }}
        >
          {theories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <input
        data-testid="model-filter"
        placeholder="Filter particles & vertices…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "4px 6px",
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      <h4 style={{ margin: "0 0 4px" }}>Particles ({particles.length})</h4>
      <div
        data-testid="model-particles"
        style={{ maxHeight: listHeight, overflow: "auto", marginBottom: 12 }}
      >
        {particles.map((p) => (
          <div
            key={p.pdg_id}
            style={{ display: "flex", gap: 8, padding: "1px 0" }}
          >
            <span style={{ width: 64, fontWeight: 500 }}>{p.name}</span>
            <span style={{ width: 48, opacity: 0.6 }}>{p.pdg_id}</span>
            <span style={{ opacity: 0.6 }}>
              m={p.mass}, q={p.charge}, s={p.spin}
            </span>
          </div>
        ))}
      </div>

      <h4 style={{ margin: "0 0 4px" }}>Vertices ({vertices.length})</h4>
      <div
        data-testid="model-vertices"
        style={{ maxHeight: listHeight, overflow: "auto" }}
      >
        {vertices.map((v) => (
          <div key={v.id} style={{ padding: "1px 0" }}>
            {`{ ${vertexParticleNames(v, model.particles).join(", ")} }`}
          </div>
        ))}
      </div>

      <h4 style={{ margin: "12px 0 4px" }}>Command (display / inspect)</h4>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ opacity: 0.5 }}>&gt;</span>
        <input
          data-testid="model-cmd-input"
          value={cmd}
          placeholder="display model"
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runCmd();
          }}
          style={{
            flex: 1,
            padding: "4px 6px",
            fontFamily: "ui-monospace, monospace",
          }}
        />
        <button type="button" onClick={() => runCmd()} disabled={busy}>
          {busy ? "…" : "Run"}
        </button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, margin: "6px 0 2px" }}>
        Quick commands
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => runCmd(ex)}
            style={{
              fontSize: 11,
              padding: "1px 7px",
              border: "1px solid #ccc",
              borderRadius: 10,
              background: "white",
              cursor: "pointer",
              opacity: 0.8,
            }}
          >
            {ex}
          </button>
        ))}
      </div>
      {output && (
        <pre
          data-testid="model-cmd-output"
          style={{
            background: "#f6f6f6",
            padding: 8,
            marginTop: 8,
            maxHeight: expanded ? 420 : 180,
            overflow: "auto",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {output}
        </pre>
      )}
    </div>
  );
}

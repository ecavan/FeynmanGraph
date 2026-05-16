import { useMemo, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import type { ExampleSpec } from "../api/types";
import { relayout } from "../canvas/layout";
import { visualForEdge } from "../canvas/edges/particle-style";
import { loadGraphIntoStore } from "../state/loadGraph";

const api = new ApiClient();

type Result = {
  diagrams: ExampleSpec[];
  count: number;
  truncated: boolean;
};

type Preset = {
  label: string;
  initial: string;
  final: string;
  qed: string;
  qcd: string;
  loops: string;
};

const PRESETS: Preset[] = [
  { label: "e+ e- → μ+ μ-",      initial: "e+ e-", final: "mu+ mu-",  qed: "2", qcd: "",  loops: "0" },
  { label: "e+ e- → t t~",       initial: "e+ e-", final: "t t~",     qed: "2", qcd: "",  loops: "0" },
  { label: "gg → H (1-loop)",    initial: "g g",   final: "H",        qed: "1", qcd: "2", loops: "1" },
  { label: "gg → t t~",          initial: "g g",   final: "t t~",     qed: "",  qcd: "2", loops: "0" },
  { label: "H → b b~",           initial: "H",     final: "b b~",     qed: "1", qcd: "",  loops: "0" },
  { label: "gg → gg",            initial: "g g",   final: "g g",      qed: "",  qcd: "4", loops: "0" },
];

export function GeneratePanel(props: { onLoad?: () => void }) {
  const [initial, setInitial] = useState("e+ e-");
  const [final_, setFinal] = useState("mu+ mu-");
  const [qed, setQed] = useState("2");
  const [qcd, setQcd] = useState("");
  const [loopCount, setLoopCount] = useState("0");
  const [maxDiagrams, setMaxDiagrams] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function applyPreset(p: Preset) {
    setInitial(p.initial);
    setFinal(p.final);
    setQed(p.qed);
    setQcd(p.qcd);
    setLoopCount(p.loops);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    const couplings: Record<string, number> = {};
    if (qed.trim()) couplings.QED = Number(qed);
    if (qcd.trim()) couplings.QCD = Number(qcd);
    try {
      const resp = await api.generateAmp({
        initial_state: initial.trim().split(/\s+/),
        final_state: final_.trim().split(/\s+/),
        coupling_orders: Object.keys(couplings).length ? couplings : undefined,
        loop_count: Number(loopCount),
        max_diagrams: Number(maxDiagrams),
      });
      setResult(resp);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}${e.hint ? ` — ${e.hint}` : ""}`);
      } else {
        setError(String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function loadIntoCanvas(spec: ExampleSpec) {
    loadGraphIntoStore(spec);
    props.onLoad?.();
  }

  return (
    <section style={{ padding: 20, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>Generate diagrams</h2>
      <p style={{ fontSize: 13, opacity: 0.75, maxWidth: 560, marginTop: 4 }}>
        Enumerate every topologically-distinct Feynman diagram for a process.
        Pick a preset below or type your own particles.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, maxWidth: 560 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              background: "white",
              border: "1px solid #c8c8c8",
              borderRadius: 12,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: 8, maxWidth: 560, alignItems: "center" }}>
        <input
          value={initial}
          onChange={(e) => setInitial(e.target.value)}
          placeholder="e+ e-"
          aria-label="Initial state"
          style={{ padding: "6px 8px", fontSize: 14, fontFamily: "monospace", border: "1px solid #bbb", borderRadius: 4 }}
        />
        <span style={{ fontSize: 18, opacity: 0.6, textAlign: "center" }}>→</span>
        <input
          value={final_}
          onChange={(e) => setFinal(e.target.value)}
          placeholder="mu+ mu-"
          aria-label="Final state"
          style={{ padding: "6px 8px", fontSize: 14, fontFamily: "monospace", border: "1px solid #bbb", borderRadius: 4, gridColumn: "3 / span 2" }}
        />
      </div>

      <details style={{ marginTop: 14, maxWidth: 560 }}>
        <summary style={{ fontSize: 12, opacity: 0.7, cursor: "pointer", userSelect: "none" }}>
          Coupling orders & loops
        </summary>
        <div style={{ marginTop: 10, padding: "10px 12px", background: "#fafafa", border: "1px solid #eee", borderRadius: 4 }}>
          <p style={{ fontSize: 12, opacity: 0.8, margin: "0 0 10px 0", lineHeight: 1.5 }}>
            Coupling order = the power of that coupling constant the amplitude scales as. It also equals
            the number of vertices of that type in each diagram. For e+e- → μ+μ- via one photon: 2 QED
            vertices, so <code>QED=2</code>. For gg → H via a top-quark loop: 2 QCD + 1 Yukawa vertex,
            so <code>QCD=2, QED=1</code> (Higgs Yukawa counts as QED here).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "120px 100px", rowGap: 6, columnGap: 8 }}>
            <label style={{ fontSize: 13 }}>QED order</label>
            <input
              value={qed}
              onChange={(e) => setQed(e.target.value)}
              placeholder="2"
              style={{ padding: "4px 6px", fontSize: 13, fontFamily: "monospace" }}
            />
            <label style={{ fontSize: 13 }}>QCD order</label>
            <input
              value={qcd}
              onChange={(e) => setQcd(e.target.value)}
              placeholder="(none)"
              style={{ padding: "4px 6px", fontSize: 13, fontFamily: "monospace" }}
            />
            <label style={{ fontSize: 13 }}>Loop count</label>
            <input
              type="number"
              min={0}
              max={4}
              value={loopCount}
              onChange={(e) => setLoopCount(e.target.value)}
              style={{ padding: "4px 6px", fontSize: 13 }}
            />
            <label style={{ fontSize: 13 }}>Max diagrams</label>
            <input
              type="number"
              min={1}
              max={500}
              value={maxDiagrams}
              onChange={(e) => setMaxDiagrams(e.target.value)}
              style={{ padding: "4px 6px", fontSize: 13 }}
            />
          </div>
        </div>
      </details>

      <button
        type="button"
        data-testid="generate-submit"
        onClick={submit}
        disabled={busy}
        style={{
          marginTop: 12,
          padding: "6px 14px",
          background: busy ? "#aaa" : "#0066ff",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: busy ? "wait" : "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {busy ? "Generating…" : "Enumerate diagrams"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "#fde2e1",
            border: "1px solid #c0392b",
            color: "#7a1c12",
            borderRadius: 4,
            fontSize: 13,
            maxWidth: 560,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, margin: "4px 0" }}>
            <strong>{result.count}</strong> diagram{result.count === 1 ? "" : "s"}
            {result.truncated && " (truncated — raise Max diagrams to see more)"}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {result.diagrams.map((d, i) => (
              <DiagramRow key={i} spec={d} onLoad={() => loadIntoCanvas(d)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DiagramRow(props: { spec: ExampleSpec; onLoad: () => void }) {
  const { spec } = props;
  const internalNodes = spec.nodes.filter((n) => n.ufo_vertex_id);
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 8px",
        borderBottom: "1px solid #eee",
        fontSize: 13,
      }}
    >
      <DiagramThumbnail spec={spec} />
      <span style={{ flex: 1, fontFamily: "monospace" }}>{spec.process_name}</span>
      <span style={{ opacity: 0.6 }}>
        {internalNodes.length} vert · {spec.edges.length} edges
      </span>
      <button
        type="button"
        onClick={props.onLoad}
        style={{
          padding: "3px 10px",
          background: "white",
          color: "#0066ff",
          border: "1px solid #0066ff",
          borderRadius: 3,
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        Load
      </button>
    </li>
  );
}

const THUMB_W = 120;
const THUMB_H = 70;

function DiagramThumbnail({ spec }: { spec: ExampleSpec }) {
  const positions = useMemo(() => {
    const nodes = spec.nodes.map((n) => ({
      id: n.id,
      position: n.position as [number, number],
    }));
    const edges = spec.edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.source_node_id,
      targetNodeId: e.target_node_id,
      particlePdgId: e.particle_pdg_id,
    }));
    const legs = spec.external_legs.map((l) => ({
      nodeId: l.node_id, kind: l.kind, label: l.label,
    }));
    const laid = relayout(nodes, edges, legs);
    return new Map(laid.nodes.map((n) => [n.id, n.position]));
  }, [spec]);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positions.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  const padX = 10, padY = 10;
  const sx = (THUMB_W - 2 * padX) / Math.max(1, maxX - minX);
  const sy = (THUMB_H - 2 * padY) / Math.max(1, maxY - minY);
  const s = Math.min(sx, sy);
  const tx = (p: [number, number]): [number, number] => [
    padX + (p[0] - minX) * s,
    padY + (p[1] - minY) * s,
  ];

  const externalIds = new Set(spec.external_legs.map((l) => l.node_id));

  return (
    <svg
      width={THUMB_W}
      height={THUMB_H}
      style={{ flexShrink: 0, background: "white", border: "1px solid #e0e0e0", borderRadius: 3 }}
    >
      {spec.edges.map((e) => {
        const a = positions.get(e.source_node_id);
        const b = positions.get(e.target_node_id);
        if (!a || !b) return null;
        const [x0, y0] = tx(a);
        const [x1, y1] = tx(b);
        const v = visualForEdge(e.particle_pdg_id, x0, y0, x1, y1);
        return (
          <path
            key={e.id}
            d={v.path}
            fill="none"
            stroke={v.stroke}
            strokeWidth={1.2}
            strokeDasharray={v.strokeDasharray}
          />
        );
      })}
      {[...positions.entries()].map(([id, p]) => {
        const [x, y] = tx(p);
        const isExt = externalIds.has(id);
        return (
          <circle
            key={id}
            cx={x}
            cy={y}
            r={isExt ? 2 : 2.5}
            fill={isExt ? "#666" : "#1a1a1a"}
          />
        );
      })}
    </svg>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ApiClient, ApiError } from "../api/client";
import type { ExampleSpec } from "../api/types";
import { relayout } from "../canvas/layout";
import { isGhostOrGoldstone, paletteSortKey, particleLabel, visualForEdge } from "../canvas/edges/particle-style";
import { useDiagramStore } from "../state/diagram";
import { useGalleryStore } from "../state/gallery";

const api = new ApiClient();

export function GeneratePanel(props: { onSuccess?: () => void }) {
  const [initialList, setInitialList] = useState<string[]>(["e+", "e-"]);
  const [finalList, setFinalList] = useState<string[]>(["mu+", "mu-"]);
  const [qed, setQed] = useState("2");
  const [qcd, setQcd] = useState("");
  const [loopCount, setLoopCount] = useState("0");
  const [maxDiagrams, setMaxDiagrams] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  function archiveBaseName(): string {
    const sane = `${initialList.join("_")}_to_${finalList.join("_")}_L${loopCount}`
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_+\-~]/g, "");
    return sane || "diagrams";
  }

  function busyLabel(): string {
    if (!busy) return "Enumerate diagrams";
    if (elapsed < 5) return "Generating…";
    const m = Math.floor(elapsed / 60);
    const s = String(elapsed % 60).padStart(2, "0");
    return `Generating… ${m}:${s}`;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const couplings: Record<string, number> = {};
    if (qed.trim()) couplings.QED = Number(qed);
    if (qcd.trim()) couplings.QCD = Number(qcd);
    try {
      const resp = await api.generateAmp({
        initial_state: initialList,
        final_state: finalList,
        coupling_orders: Object.keys(couplings).length ? couplings : undefined,
        loop_count: Number(loopCount),
        max_diagrams: Number(maxDiagrams),
      });
      useGalleryStore.setState({
        diagrams: resp.diagrams,
        count: resp.count,
        truncated: resp.truncated,
        archiveName: archiveBaseName(),
        loadedSpecId: null,
      });
      props.onSuccess?.();
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

  return (
    <section style={{ padding: 20, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>Generate diagrams</h2>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, maxWidth: 600 }}>
        <ParticleSlot label="Initial" particles={initialList} onChange={setInitialList} />
        <div style={{ fontSize: 20, opacity: 0.5, padding: "6px 4px" }}>→</div>
        <ParticleSlot label="Final" particles={finalList} onChange={setFinalList} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "100px 80px", rowGap: 6, columnGap: 8 }}>
        <label style={{ fontSize: 13 }}>QED</label>
        <input
          value={qed}
          onChange={(e) => setQed(e.target.value)}
          placeholder="—"
          style={{ padding: "4px 6px", fontSize: 13, fontFamily: "monospace" }}
        />
        <label style={{ fontSize: 13 }}>QCD</label>
        <input
          value={qcd}
          onChange={(e) => setQcd(e.target.value)}
          placeholder="—"
          style={{ padding: "4px 6px", fontSize: 13, fontFamily: "monospace" }}
        />
        <label style={{ fontSize: 13 }}>Loops</label>
        <input
          type="number"
          min={0}
          max={4}
          value={loopCount}
          onChange={(e) => setLoopCount(e.target.value)}
          style={{ padding: "4px 6px", fontSize: 13 }}
        />
        <label style={{ fontSize: 13 }}>Max</label>
        <input
          type="number"
          min={1}
          max={500}
          value={maxDiagrams}
          onChange={(e) => setMaxDiagrams(e.target.value)}
          style={{ padding: "4px 6px", fontSize: 13 }}
        />
      </div>

      <SlowProcessWarning loopCount={loopCount} />

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
        {busyLabel()}
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

    </section>
  );
}

function ParticleSlot(props: {
  label: string;
  particles: string[];
  onChange: (next: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const cachedModel = useDiagramStore((s) => s.cachedModel);

  const options = useMemo(() => {
    if (!cachedModel) return [];
    const out: { name: string; pdg: number }[] = [];
    for (const p of cachedModel.particles) {
      if (isGhostOrGoldstone(p.pdg_id)) continue;
      out.push({ name: p.name, pdg: p.pdg_id });
      if (p.anti_name && p.anti_name !== p.name) {
        out.push({ name: p.anti_name, pdg: -p.pdg_id });
      }
    }
    return out.sort((a, b) => {
      const [gA, pA] = paletteSortKey(a.pdg);
      const [gB, pB] = paletteSortKey(b.pdg);
      if (gA !== gB) return gA - gB;
      return pA - pB;
    });
  }, [cachedModel]);

  function add(name: string) {
    props.onChange([...props.particles, name]);
    setPicking(false);
  }
  function removeAt(i: number) {
    props.onChange(props.particles.filter((_, j) => j !== i));
  }

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{props.label}</div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "6px 6px",
          border: "1px solid #bbb",
          borderRadius: 4,
          minHeight: 34,
          alignItems: "center",
          background: "white",
        }}
      >
        {props.particles.map((name, i) => (
          <Chip key={i} label={name} onRemove={() => removeAt(i)} />
        ))}
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          style={{
            padding: "2px 8px",
            fontSize: 12,
            border: "1px dashed #999",
            background: "white",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          + Add
        </button>
      </div>
      {picking && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 260,
            overflowY: "auto",
            background: "white",
            border: "1px solid #bbb",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            zIndex: 10,
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: 8, fontSize: 12, opacity: 0.6 }}>No model loaded</div>
          )}
          {options.map((opt) => (
            <button
              key={`${opt.pdg}-${opt.name}`}
              type="button"
              onClick={() => add(opt.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                padding: "4px 8px",
                border: "none",
                borderBottom: "1px solid #f0f0f0",
                background: "white",
                cursor: "pointer",
                fontSize: 12,
                textAlign: "left",
                fontFamily:
                  '"Latin Modern Math", "Cambria Math", "Times New Roman", serif',
              }}
            >
              <span style={{ minWidth: 50 }}>{particleLabel(opt.pdg, opt.name)}</span>
              <span style={{ opacity: 0.5, fontSize: 11 }}>{opt.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip(props: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 4px 2px 8px",
        background: "#e6f0ff",
        color: "#0044aa",
        border: "1px solid #b8d4ff",
        borderRadius: 12,
        fontSize: 12,
        fontFamily: "monospace",
      }}
    >
      {props.label}
      <button
        type="button"
        onClick={props.onRemove}
        style={{
          width: 16,
          height: 16,
          padding: 0,
          fontSize: 11,
          lineHeight: 1,
          border: "none",
          background: "transparent",
          color: "#0044aa",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </span>
  );
}

const THUMB_W = 120;
const THUMB_H = 70;

export function DiagramThumbnail({ spec }: { spec: ExampleSpec }) {
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

function SlowProcessWarning({ loopCount }: { loopCount: string }) {
  const n = Number(loopCount);
  if (!Number.isFinite(n) || n < 1) return null;
  const copy =
    n === 1
      ? "1-loop processes can take 30s–2min for 5+ externals."
      : n === 2
      ? "2-loop processes typically take 1–5 minutes."
      : "3+ loop processes can take 5+ minutes. Consider a smaller process first.";
  return (
    <div
      data-testid="slow-process-warning"
      style={{
        marginTop: 10,
        padding: "6px 10px",
        background: "#fff5d6",
        border: "1px solid #c89500",
        color: "#5a4400",
        borderRadius: 4,
        fontSize: 12,
        maxWidth: 560,
      }}
    >
      ⚠ {copy}
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  isGhostOrGoldstone,
  paletteSortKey,
  particleLabel,
  visualForEdge,
} from "../canvas/edges/particle-style";
import { useDiagramStore } from "../state/diagram";
import { TheoryPicker } from "./TheoryPicker";

export function Toolbox() {
  const modelId = useDiagramStore((s) => s.modelId);
  const theoryId = useDiagramStore((s) => s.theoryId);
  const cachedModel = useDiagramStore((s) => s.cachedModel);
  const nodes = useDiagramStore((s) => s.nodes);
  const reset = useDiagramStore((s) => s.reset);
  const setModelId = useDiagramStore((s) => s.setModelId);
  const setTheoryId = useDiagramStore((s) => s.setTheoryId);
  const addVertex = useDiagramStore((s) => s.addVertex);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const canUndo = useDiagramStore((s) => s._past.length > 0);
  const canRedo = useDiagramStore((s) => s._future.length > 0);
  const edgeDraftActive = useDiagramStore((s) => s.edgeDraftActive);
  const edgeDraftSource = useDiagramStore((s) => s.edgeDraftSource);
  const startEdgeDraft = useDiagramStore((s) => s.startEdgeDraft);
  const cancelEdgeDraft = useDiagramStore((s) => s.cancelEdgeDraft);
  const canAddParticle = nodes.length >= 1;

  const [showAllParticles, setShowAllParticles] = useState(false);

  function clearDiagram() {
    const m = modelId;
    const t = theoryId;
    reset();
    if (m) setModelId(m);
    if (t) setTheoryId(t);
  }

  function handleAddVertex() {
    const current = useDiagramStore.getState().nodes;
    const id = nextVertexId(current.map((n) => n.id));
    addVertex({ id, position: [0, 0] });
  }

  function toggleEdgeDraft() {
    if (edgeDraftActive) cancelEdgeDraft();
    else startEdgeDraft();
  }

  const paletteParticles = useMemo(() => {
    if (!cachedModel) return [];
    const filtered = showAllParticles
      ? cachedModel.particles
      : cachedModel.particles.filter((p) => !isGhostOrGoldstone(p.pdg_id));
    return [...filtered].sort((a, b) => {
      const [gA, pA] = paletteSortKey(a.pdg_id);
      const [gB, pB] = paletteSortKey(b.pdg_id);
      if (gA !== gB) return gA - gB;
      return pA - pB;
    });
  }, [cachedModel, showAllParticles]);

  return (
    <div data-testid="toolbox" style={{ fontSize: 13 }}>
      <TheoryPicker />
      <hr style={{ margin: "10px 0", border: "none", borderTop: "1px solid #e4e4e4" }} />

      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <IconButton
          testId="undo"
          label="↶ Undo"
          title="Undo last action (⌘Z)"
          onClick={undo}
          disabled={!canUndo}
        />
        <IconButton
          testId="redo"
          label="↷ Redo"
          title="Redo (⇧⌘Z)"
          onClick={redo}
          disabled={!canRedo}
        />
        <IconButton
          testId="clear-diagram"
          label="Clear"
          title="Clear the diagram"
          onClick={clearDiagram}
          variant="danger"
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <ToolboxButton
          testId="add-vertex"
          label="+ Add vertex"
          onClick={handleAddVertex}
          variant="primary"
        />
        <ToolboxButton
          testId="add-particle"
          label={edgeDraftActive ? "× Cancel particle" : "+ Add particle"}
          onClick={toggleEdgeDraft}
          variant={edgeDraftActive ? "danger" : "primary"}
          disabled={!canAddParticle && !edgeDraftActive}
          title={canAddParticle ? "Click two vertices on the canvas" : "Add a vertex first"}
        />
      </div>
      {edgeDraftActive && (
        <div
          data-testid="edge-draft-hint"
          style={{
            marginTop: 8,
            padding: "6px 8px",
            border: "1px solid #b4dcc4",
            borderRadius: 4,
            background: "#eafbf1",
            fontSize: 12,
          }}
        >
          {edgeDraftSource == null
            ? "Click a vertex to start."
            : `Start: ${edgeDraftSource}. Click another vertex.`}
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>Particles</h3>
      {!cachedModel ? (
        <p style={{ fontSize: 12, opacity: 0.55 }}>No model loaded.</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {paletteParticles.map((p) => (
              <li
                key={p.pdg_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 0",
                  fontFamily:
                    '"Latin Modern Math", "Cambria Math", "Times New Roman", serif',
                }}
              >
                <ParticleStrokePreview pdgId={p.pdg_id} />
                <span style={{ minWidth: 50 }}>{particleLabel(p.pdg_id, p.name)}</span>
                <span style={{ opacity: 0.45, fontSize: 11 }}>{p.name}</span>
              </li>
            ))}
          </ul>
          <label style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11, opacity: 0.7 }}>
            <input
              type="checkbox"
              checked={showAllParticles}
              onChange={(e) => setShowAllParticles(e.target.checked)}
            />
            Show ghosts &amp; Goldstones
          </label>
        </>
      )}
    </div>
  );
}

function nextId(existing: string[], prefix: string): string {
  const used = new Set<number>();
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of existing) {
    const m = id.match(re);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${n}`;
}

function nextVertexId(existing: string[]): string {
  return nextId(existing, "v");
}

function ParticleStrokePreview({ pdgId }: { pdgId: number }) {
  const width = 48;
  const height = 16;
  const y = height / 2;
  const visual = visualForEdge(pdgId, 2, y, width - 2, y);
  return (
    <svg width={width} height={height} style={{ flexShrink: 0 }}>
      <path
        d={visual.path}
        fill="none"
        stroke={visual.stroke}
        strokeWidth={visual.strokeWidth}
        strokeDasharray={visual.strokeDasharray}
      />
      {visual.showArrow && (
        <polygon points="0,-3 6,0 0,3" fill={visual.stroke} transform={`translate(${width / 2}, ${y})`} />
      )}
    </svg>
  );
}

function ToolboxButton(props: {
  label: string;
  onClick: () => void;
  variant: "primary" | "subtle" | "danger";
  testId?: string;
  disabled?: boolean;
  title?: string;
}) {
  const primary = props.variant === "primary";
  const danger = props.variant === "danger";
  const disabled = props.disabled ?? false;
  const borderColor = disabled
    ? "#bbb"
    : danger
    ? "#c0392b"
    : primary
    ? "#0066ff"
    : "#bbb";
  const background = disabled
    ? "#eee"
    : danger
    ? "#c0392b"
    : primary
    ? "#0066ff"
    : "#fff";
  const color = disabled ? "#888" : danger || primary ? "white" : "#222";
  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      disabled={disabled}
      title={props.title}
      style={{
        padding: "6px 10px",
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "1px solid",
        borderColor,
        background,
        color,
        borderRadius: 4,
        textAlign: "left",
        fontWeight: 500,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {props.label}
    </button>
  );
}

function IconButton(props: {
  label: string;
  onClick: () => void;
  testId?: string;
  title?: string;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  const danger = props.variant === "danger";
  const disabled = props.disabled ?? false;
  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      title={props.title}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "5px 8px",
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "1px solid",
        borderColor: danger ? "#c0392b" : "#bbb",
        background: "white",
        color: disabled ? "#999" : danger ? "#c0392b" : "#444",
        borderRadius: 4,
        fontWeight: 500,
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {props.label}
    </button>
  );
}

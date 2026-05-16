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
  const addEdge = useDiagramStore((s) => s.addEdge);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const canUndo = useDiagramStore((s) => s._past.length > 0);
  const canRedo = useDiagramStore((s) => s._future.length > 0);
  const canAddParticle = nodes.length >= 2;

  const [edgeFormOpen, setEdgeFormOpen] = useState(false);
  const [edgeFrom, setEdgeFrom] = useState<string>("");
  const [edgeTo, setEdgeTo] = useState<string>("");
  const [edgePdg, setEdgePdg] = useState<number | null>(null);
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

  function submitNewEdge() {
    if (!edgeFrom || !edgeTo) return;
    const id = nextEdgeId(useDiagramStore.getState().edges.map((e) => e.id));
    addEdge({
      id,
      sourceNodeId: edgeFrom,
      targetNodeId: edgeTo,
      particlePdgId: edgePdg ?? null,
    });
    setEdgeFormOpen(false);
    setEdgeFrom("");
    setEdgeTo("");
    setEdgePdg(null);
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

  const dropdownParticles = useMemo(() => {
    if (!cachedModel) return [];
    return [...cachedModel.particles]
      .filter((p) => showAllParticles || !isGhostOrGoldstone(p.pdg_id))
      .sort((a, b) => {
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
        <div>
          <ToolboxButton
            testId="add-particle"
            label={edgeFormOpen ? "× Cancel particle" : "+ Add particle"}
            onClick={() => setEdgeFormOpen((open) => !open)}
            variant="primary"
            disabled={!canAddParticle}
            title={canAddParticle ? undefined : "Add at least 2 vertices first"}
          />
          {!canAddParticle && (
            <p style={{ fontSize: 11, opacity: 0.7, margin: "4px 0 0", color: "#5a4400" }}>
              Add at least two vertices before drawing a particle line.
            </p>
          )}
        </div>
      </div>
      {edgeFormOpen && (
        <div
          data-testid="add-particle-form"
          style={{
            marginTop: 8,
            padding: 10,
            border: "1px solid #cdd6e0",
            borderRadius: 6,
            background: "#f9fbfd",
          }}
        >
          <Field label="From">
            <VertexDropdown value={edgeFrom} setValue={setEdgeFrom} vertices={nodes} />
          </Field>
          <Field label="To">
            <VertexDropdown value={edgeTo} setValue={setEdgeTo} vertices={nodes} />
          </Field>
          {edgeFrom && edgeFrom === edgeTo && (
            <p style={{ fontSize: 11, opacity: 0.7, margin: "2px 0", color: "#7b5a00" }}>
              From = To creates a tadpole loop on that vertex (valid topology).
            </p>
          )}
          {nodes.length < 1 && (
            <p style={{ fontSize: 11, color: "#a00", margin: "2px 0" }}>
              Add at least one vertex first.
            </p>
          )}
          <Field label="Particle">
            <select
              value={edgePdg ?? ""}
              onChange={(e) => setEdgePdg(e.target.value === "" ? null : Number(e.target.value))}
              style={{ width: "100%", fontSize: 12 }}
            >
              <option value="">— pick later —</option>
              {dropdownParticles.map((p) => (
                <option key={p.pdg_id} value={p.pdg_id}>
                  {particleLabel(p.pdg_id, p.name)} ({p.name})
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={submitNewEdge}
            disabled={!edgeFrom || !edgeTo}
            style={{
              marginTop: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: edgeFrom && edgeTo ? "pointer" : "not-allowed",
            }}
          >
            Add particle
          </button>
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>Particle palette</h3>
      {!cachedModel ? (
        <p style={{ fontSize: 12, opacity: 0.6 }}>
          Model not loaded yet. Generate a process first or import a UFO.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 11, opacity: 0.65, margin: "2px 0 6px" }}>
            Reference. To assign to an existing edge, click the edge in the
            canvas.
          </p>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ display: "block", fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
        {label}
      </label>
      {children}
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

function nextEdgeId(existing: string[]): string {
  return nextId(existing, "e");
}

function VertexDropdown(props: {
  value: string;
  setValue: (id: string) => void;
  vertices: { id: string; position: [number, number] }[];
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.setValue(e.target.value)}
      style={{ width: "100%", fontSize: 12 }}
    >
      <option value="">— pick —</option>
      {props.vertices.map((v) => (
        <option key={v.id} value={v.id}>
          {v.id}
        </option>
      ))}
    </select>
  );
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
  variant: "primary" | "subtle";
  testId?: string;
  disabled?: boolean;
  title?: string;
}) {
  const primary = props.variant === "primary";
  const disabled = props.disabled ?? false;
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
        borderColor: disabled ? "#bbb" : primary ? "#0066ff" : "#bbb",
        background: disabled ? "#eee" : primary ? "#0066ff" : "#fff",
        color: disabled ? "#888" : primary ? "white" : "#222",
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

import { useMemo, useState } from "react";
import {
  isGhostOrGoldstone,
  paletteSortKey,
  particleLabel,
  visualForEdge,
} from "../canvas/edges/particle-style";
import { useDiagramStore } from "../state/diagram";
import { TheoryPicker } from "./TheoryPicker";

/**
 * Left-side toolbox: button-driven editor.
 *  - Clear diagram
 *  - + Add vertex          (auto-placed near canvas center)
 *  - + Add particle        (form: From / To / Particle dropdown)
 *  - Particle palette      (reference — gauge bosons → scalars → fermions)
 */
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
    const id = `v${Date.now()}`;
    // Position [0,0] tells the store action to auto-place near the cluster center.
    addVertex({ id, position: [0, 0] });
  }

  function submitNewEdge() {
    if (!edgeFrom || !edgeTo) return;
    const id = `e${Date.now()}`;
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

  // For the edge-form particle dropdown: hide ghosts/Goldstones too,
  // ordered the same way.
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
      <h3 style={{ marginTop: 0 }}>Build</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <ToolboxButton
          testId="clear-diagram"
          label="Clear diagram"
          onClick={clearDiagram}
          variant="subtle"
        />
        <ToolboxButton
          testId="add-vertex"
          label="+ Add vertex"
          onClick={handleAddVertex}
          variant="primary"
        />
        <ToolboxButton
          testId="add-particle"
          label={edgeFormOpen ? "× Cancel particle" : "+ Add particle"}
          onClick={() => setEdgeFormOpen((open) => !open)}
          variant="primary"
        />
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
          Pick a model in the <em>Setup</em> tab to see the particle list.
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
}) {
  const primary = props.variant === "primary";
  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      style={{
        padding: "6px 10px",
        fontSize: 12,
        cursor: "pointer",
        border: "1px solid",
        borderColor: primary ? "#0066ff" : "#bbb",
        background: primary ? "#0066ff" : "#fff",
        color: primary ? "white" : "#222",
        borderRadius: 4,
        textAlign: "left",
        fontWeight: 500,
      }}
    >
      {props.label}
    </button>
  );
}

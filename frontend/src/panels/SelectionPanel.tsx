import {
  isGhostOrGoldstone,
  paletteSortKey,
  particleLabel,
  visualForEdge,
} from "../canvas/edges/particle-style";
import { useDiagramStore } from "../state/diagram";

export function SelectionPanel() {
  const selectedId = useDiagramStore((s) => s.selectedId);
  const selectedKind = useDiagramStore((s) => s.selectedKind);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const externalLegs = useDiagramStore((s) => s.externalLegs);
  const modelId = useDiagramStore((s) => s.modelId);
  const model = useDiagramStore((s) => s.cachedModel);
  const removeVertex = useDiagramStore((s) => s.removeVertex);
  const removeEdge = useDiagramStore((s) => s.removeEdge);
  const setEdgeParticle = useDiagramStore((s) => s.setEdgeParticle);
  const addExternalLeg = useDiagramStore((s) => s.addExternalLeg);
  const removeExternalLeg = useDiagramStore((s) => s.removeExternalLeg);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const addSelfLoop = useDiagramStore((s) => s.addSelfLoop);
  const duplicateEdge = useDiagramStore((s) => s.duplicateEdge);

  if (selectedKind == null || selectedId == null) {
    return (
      <div data-testid="selection-panel">
        <h4>Selection</h4>
        <p style={{ fontSize: 12, opacity: 0.55 }}>Nothing selected.</p>
      </div>
    );
  }

  if (selectedKind === "node") {
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) {
      return (
        <div data-testid="selection-panel">
          <h4>Selection</h4>
          <p style={{ fontSize: 12, opacity: 0.6 }}>Selection lost — pick again.</p>
        </div>
      );
    }
    const leg = externalLegs.find((l) => l.nodeId === selectedId);
    const status = leg ? leg.kind : "internal";

    function setKind(kind: "internal" | "incoming" | "outgoing") {
      if (selectedId == null) return;
      if (kind === "internal") {
        removeExternalLeg(selectedId);
      } else {
        const existing = externalLegs.find((l) => l.nodeId === selectedId);
        const label = existing?.label ?? nextLegLabel(externalLegs.map((l) => l.label));
        addExternalLeg({ nodeId: selectedId, kind, label });
      }
    }

    return (
      <div data-testid="selection-panel">
        <h4>Vertex {selectedId}</h4>
        <p style={{ fontSize: 12, opacity: 0.7, margin: "4px 0" }}>
          Role: <strong>{status}</strong>
          {leg ? ` (${leg.label})` : ""}
        </p>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <RoleButton active={status === "internal"} label="Internal" onClick={() => setKind("internal")} />
          <RoleButton active={status === "incoming"} label="Incoming" onClick={() => setKind("incoming")} />
          <RoleButton active={status === "outgoing"} label="Outgoing" onClick={() => setKind("outgoing")} />
        </div>
        <hr style={{ margin: "10px 0" }} />
        <button
          type="button"
          data-testid="add-self-loop"
          onClick={() => addSelfLoop(selectedId)}
          title="Add a self-loop edge on this vertex"
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          ↻ Add self-loop
        </button>
        <hr style={{ margin: "10px 0" }} />
        <button
          type="button"
          onClick={() => {
            removeVertex(selectedId);
            setSelection(null, null);
          }}
          style={{ color: "#c00" }}
        >
          Delete vertex
        </button>
      </div>
    );
  }

  // selectedKind === "edge"
  const edge = edges.find((e) => e.id === selectedId);
  if (!edge) {
    return (
      <div data-testid="selection-panel">
        <h4>Selection</h4>
        <p style={{ fontSize: 12, opacity: 0.6 }}>Selection lost — pick again.</p>
      </div>
    );
  }
  const currentParticle = model?.particles.find((p) => p.pdg_id === edge.particlePdgId);

  return (
    <div data-testid="selection-panel">
      <h4>Edge {selectedId}</h4>
      <p style={{ fontSize: 12, margin: "4px 0", opacity: 0.7 }}>
        {edge.sourceNodeId} → {edge.targetNodeId}
      </p>
      <p style={{ fontSize: 12, margin: "4px 0" }}>
        Particle:{" "}
        {currentParticle
          ? `${currentParticle.name} (PDG ${currentParticle.pdg_id})`
          : edge.particlePdgId == null
          ? "(none — pick below)"
          : `PDG ${edge.particlePdgId}`}
      </p>
      {model && modelId && (
        <EdgeParticleList
          model={model}
          currentPdg={edge.particlePdgId ?? null}
          onPick={(pdgId) => setEdgeParticle(selectedId, pdgId)}
        />
      )}
      <hr style={{ margin: "10px 0" }} />
      <button
        type="button"
        data-testid="duplicate-edge"
        onClick={() => duplicateEdge(selectedId)}
        title="Add a parallel edge between the same two vertices"
        style={{ padding: "4px 10px", fontSize: 12 }}
      >
        ⌇ Add parallel edge
      </button>
      <hr style={{ margin: "10px 0" }} />
      <button
        type="button"
        onClick={() => {
          removeEdge(selectedId);
          setSelection(null, null);
        }}
        style={{ color: "#c00" }}
      >
        Delete edge
      </button>
    </div>
  );
}

function RoleButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: "2px 8px",
        background: props.active ? "#0066ff" : "white",
        color: props.active ? "white" : "#222",
        border: "1px solid #888",
        borderRadius: 3,
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      {props.label}
    </button>
  );
}

function nextLegLabel(existing: string[]): string {
  const max = existing.reduce((m, l) => {
    const n = Number(l.replace(/^p/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `p${max + 1}`;
}

function EdgeParticleList(props: {
  model: { particles: { pdg_id: number; name: string }[] };
  currentPdg: number | null;
  onPick: (pdgId: number) => void;
}) {
  const sorted = [...props.model.particles]
    .filter((p) => !isGhostOrGoldstone(p.pdg_id))
    .sort((a, b) => {
      const [gA, pA] = paletteSortKey(a.pdg_id);
      const [gB, pB] = paletteSortKey(b.pdg_id);
      if (gA !== gB) return gA - gB;
      return pA - pB;
    });
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 260, overflowY: "auto" }}>
      {sorted.map((p) => {
        const active = props.currentPdg === p.pdg_id;
        return (
          <li key={p.pdg_id} style={{ padding: "1px 0" }}>
            <button
              type="button"
              onClick={() => props.onPick(p.pdg_id)}
              aria-pressed={active}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px",
                background: active ? "#e6f0ff" : "white",
                border: active ? "1px solid #0066ff" : "1px solid #d4d4d4",
                borderRadius: 3,
                cursor: "pointer",
                fontSize: 12,
                textAlign: "left",
                fontFamily:
                  '"Latin Modern Math", "Cambria Math", "Times New Roman", serif',
              }}
            >
              <EdgeStrokePreview pdgId={p.pdg_id} />
              <span style={{ minWidth: 50 }}>{particleLabel(p.pdg_id, p.name)}</span>
              <span style={{ opacity: 0.5, fontSize: 11, marginLeft: "auto" }}>{p.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EdgeStrokePreview({ pdgId }: { pdgId: number }) {
  const w = 44;
  const h = 14;
  const y = h / 2;
  const visual = visualForEdge(pdgId, 2, y, w - 2, y);
  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      <path
        d={visual.path}
        fill="none"
        stroke={visual.stroke}
        strokeWidth={visual.strokeWidth}
        strokeDasharray={visual.strokeDasharray}
      />
      {visual.showArrow && (
        <polygon
          points="0,-3 6,0 0,3"
          fill={visual.stroke}
          transform={`translate(${w / 2}, ${y})`}
        />
      )}
    </svg>
  );
}

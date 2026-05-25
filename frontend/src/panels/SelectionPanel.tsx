import {
  isGhostOrGoldstone,
  paletteSortKey,
  particleLabel,
  visualForEdge,
} from "../canvas/edges/particle-style";
import type { Model, Particle } from "../api/types";
import type { ExternalLeg, ParticleEdge, VertexNode } from "../state/diagram";
import { nextLegLabel, useDiagramStore } from "../state/diagram";

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
  const setEdgeCutPair = useDiagramStore((s) => s.setEdgeCutPair);
  const clearEdgeCutPair = useDiagramStore((s) => s.clearEdgeCutPair);
  const addExternalLeg = useDiagramStore((s) => s.addExternalLeg);
  const removeExternalLeg = useDiagramStore((s) => s.removeExternalLeg);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const addSelfLoop = useDiagramStore((s) => s.addSelfLoop);
  const duplicateEdge = useDiagramStore((s) => s.duplicateEdge);
  const lmbEdgeIds = useDiagramStore((s) => s.lmbEdgeIds);

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
        {leg && (
          <>
            <hr style={{ margin: "10px 0" }} />
            <ExternalCutControl
              externalNodeId={selectedId}
              allNodes={nodes}
              allEdges={edges}
              allLegs={externalLegs}
              onPair={(otherExternalId) => {
                const myEdge = edges.find(
                  (e) => e.sourceNodeId === selectedId || e.targetNodeId === selectedId,
                );
                const otherEdge = edges.find(
                  (e) => e.sourceNodeId === otherExternalId || e.targetNodeId === otherExternalId,
                );
                if (myEdge && otherEdge) setEdgeCutPair(myEdge.id, otherEdge.id);
              }}
              onClear={() => {
                const myEdge = edges.find(
                  (e) => e.sourceNodeId === selectedId || e.targetNodeId === selectedId,
                );
                if (myEdge) clearEdgeCutPair(myEdge.id);
              }}
            />
          </>
        )}
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
        <NodeDetails node={node} edges={edges} leg={leg ?? null} />
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
      <CutControl
        edge={edge}
        allEdges={edges}
        onPair={(partnerId) => setEdgeCutPair(selectedId, partnerId)}
        onClear={() => clearEdgeCutPair(selectedId)}
      />
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
      <EdgeDetails
        edge={edge}
        allEdges={edges}
        model={model}
        lmbEdgeIds={lmbEdgeIds}
      />
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

function CutControl(props: {
  edge: ParticleEdge;
  allEdges: ParticleEdge[];
  onPair: (partnerEdgeId: string) => void;
  onClear: () => void;
}) {
  const { edge, allEdges } = props;
  const cutLabel = edge.cutLabel ?? null;

  const eligiblePartners = allEdges.filter(
    (e) =>
      e.id !== edge.id &&
      e.sourceNodeId !== e.targetNodeId &&
      (e.cutLabel == null || e.cutLabel === cutLabel),
  );

  if (cutLabel != null) {
    const linked = allEdges.filter((e) => e.cutLabel === cutLabel && e.id !== edge.id);
    return (
      <div data-testid="cut-control" style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          <strong>Cut:</strong>{" "}
          {linked.length === 1
            ? `linked to ${linked[0].id}`
            : linked.length === 0
            ? `orphan (no partner)`
            : `⚠ shared with ${linked.length} other edges`}{" "}
          <span style={{ opacity: 0.5 }}>(label: {cutLabel})</span>
        </div>
        <button
          type="button"
          data-testid="cut-unlink"
          onClick={props.onClear}
          style={{ padding: "3px 8px", fontSize: 12 }}
        >
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div data-testid="cut-control" style={{ marginTop: 4 }}>
      <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Cut (forward-scattering glue):
      </label>
      <select
        data-testid="cut-partner-select"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) props.onPair(e.target.value);
        }}
        style={{
          width: "100%",
          padding: "3px 6px",
          fontSize: 12,
          border: "1px solid #bbb",
          borderRadius: 3,
        }}
      >
        <option value="">— select partner edge —</option>
        {eligiblePartners.map((e) => (
          <option key={e.id} value={e.id}>
            {e.id} ({e.sourceNodeId} → {e.targetNodeId}
            {e.particlePdgId != null ? `, PDG ${e.particlePdgId}` : ""})
          </option>
        ))}
      </select>
    </div>
  );
}

function ExternalCutControl(props: {
  externalNodeId: string;
  allNodes: VertexNode[];
  allEdges: ParticleEdge[];
  allLegs: ExternalLeg[];
  onPair: (otherExternalId: string) => void;
  onClear: () => void;
}) {
  const externalIds = new Set(props.allLegs.map((l) => l.nodeId));
  const myEdge = props.allEdges.find(
    (e) => e.sourceNodeId === props.externalNodeId || e.targetNodeId === props.externalNodeId,
  );
  if (!myEdge) {
    return (
      <div data-testid="external-cut-control" style={{ fontSize: 12, opacity: 0.6 }}>
        Cut: (no incident edge yet)
      </div>
    );
  }

  if (myEdge.cutLabel != null) {
    const partnerEdge = props.allEdges.find(
      (e) => e.cutLabel === myEdge.cutLabel && e.id !== myEdge.id,
    );
    const partnerExternal = partnerEdge
      ? [partnerEdge.sourceNodeId, partnerEdge.targetNodeId].find((id) => externalIds.has(id))
      : undefined;
    return (
      <div data-testid="external-cut-control" style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          <strong>Cut:</strong>{" "}
          {partnerExternal
            ? `paired with ${partnerExternal}`
            : partnerEdge
            ? `paired with edge ${partnerEdge.id} (no external end)`
            : `orphan (no partner)`}
        </div>
        <button
          type="button"
          data-testid="external-cut-unlink"
          onClick={props.onClear}
          style={{ padding: "3px 8px", fontSize: 12 }}
        >
          Unlink
        </button>
      </div>
    );
  }

  const candidates = props.allLegs
    .map((l) => l.nodeId)
    .filter((id) => id !== props.externalNodeId)
    .filter((id) => {
      const e = props.allEdges.find(
        (edge) => edge.sourceNodeId === id || edge.targetNodeId === id,
      );
      return e != null && e.cutLabel == null && e.id !== myEdge.id;
    });

  return (
    <div data-testid="external-cut-control" style={{ marginTop: 4 }}>
      <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Cut (pair with another external leg):
      </label>
      <select
        data-testid="external-cut-partner-select"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) props.onPair(e.target.value);
        }}
        style={{
          width: "100%",
          padding: "3px 6px",
          fontSize: 12,
          border: "1px solid #bbb",
          borderRadius: 3,
        }}
      >
        <option value="">— select partner external —</option>
        {candidates.map((id) => {
          const leg = props.allLegs.find((l) => l.nodeId === id);
          return (
            <option key={id} value={id}>
              {id} ({leg?.kind ?? ""} {leg?.label ?? ""})
            </option>
          );
        })}
      </select>
    </div>
  );
}

function EdgeDetails(props: {
  edge: ParticleEdge;
  allEdges: ParticleEdge[];
  model: Model | null;
  lmbEdgeIds: string[] | null;
}) {
  const { edge, allEdges, model, lmbEdgeIds } = props;
  const particle =
    edge.particlePdgId != null
      ? model?.particles.find(
          (p) => p.pdg_id === Math.abs(edge.particlePdgId as number),
        )
      : undefined;
  const particleDisplay =
    edge.particlePdgId == null
      ? "(unassigned)"
      : `${displayParticleName(particle, edge.particlePdgId)} (PDG ${edge.particlePdgId})`;
  const mass = particle?.mass ?? "—";
  const isChord = lmbEdgeIds?.includes(edge.id) ?? false;
  const cutPartner = edge.cutLabel
    ? allEdges.find((e) => e.cutLabel === edge.cutLabel && e.id !== edge.id)
    : undefined;
  const cutDisplay = edge.cutLabel
    ? `${edge.cutLabel}${cutPartner ? ` → ${cutPartner.id}` : ""}`
    : "—";
  return (
    <DetailsBlock
      rows={[
        ["edge id", edge.id],
        ["particle", particleDisplay],
        ["mass", mass],
        ["flow", `${edge.sourceNodeId} → ${edge.targetNodeId}`],
        ["LMB chord", isChord ? "yes" : "no"],
        ["cut label", cutDisplay],
        ["half-port IDs", "computed at export"],
      ]}
    />
  );
}

function NodeDetails(props: {
  node: VertexNode;
  edges: ParticleEdge[];
  leg: ExternalLeg | null;
}) {
  const { node, edges, leg } = props;
  const incident = edges
    .filter((e) => e.sourceNodeId === node.id || e.targetNodeId === node.id)
    .map((e) => e.id);
  const role = leg ? leg.kind : "internal";
  const ufo = node.ufoVertexId ?? "(auto-detect)";
  return (
    <DetailsBlock
      rows={[
        ["vertex id", node.id],
        ["position", `(${Math.round(node.position[0])}, ${Math.round(node.position[1])})`],
        ["UFO vertex rule", ufo],
        ["external role", role],
        ["incident edges", incident.length ? incident.join(", ") : "—"],
      ]}
    />
  );
}

function DetailsBlock(props: { rows: [string, string][] }) {
  return (
    <div
      data-testid="selection-details"
      style={{
        marginTop: 12,
        padding: "8px 10px",
        border: "1px solid #e0e0e0",
        background: "#f7f7f7",
        borderRadius: 4,
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        lineHeight: 1.55,
      }}
    >
      {props.rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex" }}>
          <span style={{ width: 110, opacity: 0.55, flexShrink: 0 }}>{k}</span>
          <span style={{ flex: 1, wordBreak: "break-word" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function displayParticleName(particle: Particle | undefined, pdg: number): string {
  if (!particle) return `pdg ${pdg}`;
  if (pdg < 0 && particle.anti_name !== particle.name) return particle.anti_name;
  return particle.name;
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

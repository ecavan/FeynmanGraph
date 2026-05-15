import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { Model } from "../api/types";
import { useDiagramStore } from "../state/diagram";
import { ParticlePicker } from "./ParticlePicker";

const api = new ApiClient();

/**
 * Renders contextual controls for whatever is currently selected on the canvas.
 * - vertex selected → leg-state toggle + delete button
 * - edge selected   → particle picker (legal completions first) + delete button
 * - nothing selected → short hint about how to use the canvas
 */
export function SelectionPanel() {
  const selectedId = useDiagramStore((s) => s.selectedId);
  const selectedKind = useDiagramStore((s) => s.selectedKind);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const externalLegs = useDiagramStore((s) => s.externalLegs);
  const modelId = useDiagramStore((s) => s.modelId);
  const theoryId = useDiagramStore((s) => s.theoryId);
  const removeVertex = useDiagramStore((s) => s.removeVertex);
  const removeEdge = useDiagramStore((s) => s.removeEdge);
  const setEdgeParticle = useDiagramStore((s) => s.setEdgeParticle);
  const cycleLegKind = useDiagramStore((s) => s.cycleLegKind);
  const addExternalLeg = useDiagramStore((s) => s.addExternalLeg);
  const removeExternalLeg = useDiagramStore((s) => s.removeExternalLeg);
  const setSelection = useDiagramStore((s) => s.setSelection);

  const [model, setModel] = useState<Model | null>(null);

  useEffect(() => {
    if (!modelId) {
      setModel(null);
      return;
    }
    let cancelled = false;
    api
      .getModel(modelId)
      .then((m) => {
        if (!cancelled) setModel(m);
      })
      .catch(() => {
        if (!cancelled) setModel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  if (selectedKind == null || selectedId == null) {
    return (
      <div data-testid="selection-panel">
        <h4>Selection</h4>
        <p style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.4 }}>
          Click a vertex or edge to edit it. Drag the "New vertex" handle from the
          left toolbox onto the canvas to add a vertex. Drag from the top of one
          vertex to the bottom of another to draw an edge. Press Delete or
          Backspace to remove the selection.
        </p>
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
        <p style={{ fontSize: 11, opacity: 0.5, margin: "6px 0" }}>
          Tip: clicking the same vertex repeatedly via the "Cycle" button below
          rotates internal → incoming → outgoing.
        </p>
        <button type="button" onClick={() => cycleLegKind(selectedId)}>
          Cycle role
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
        <ParticlePicker
          modelId={modelId}
          theoryId={theoryId}
          knownPdgs={[]}
          unknownCount={0}
          allParticles={model.particles}
          onPick={(pdgId) => setEdgeParticle(selectedId, pdgId)}
        />
      )}
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

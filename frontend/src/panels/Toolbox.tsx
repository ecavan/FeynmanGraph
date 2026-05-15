import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { Model } from "../api/types";
import { NEW_VERTEX_DRAG_TYPE } from "../canvas/DiagramCanvas";
import { styleForPdg, visualForEdge } from "../canvas/edges/particle-style";
import { useDiagramStore } from "../state/diagram";

const api = new ApiClient();

/**
 * Left-side toolbox for the canvas:
 *  - draggable "New vertex" handle (drop it on the canvas to add a vertex)
 *  - particle palette listing every particle in the loaded model, with each
 *    one rendered in its textbook style so users can see the conventions
 */
export function Toolbox() {
  const modelId = useDiagramStore((s) => s.modelId);
  const theoryId = useDiagramStore((s) => s.theoryId);
  const reset = useDiagramStore((s) => s.reset);
  const setModelId = useDiagramStore((s) => s.setModelId);
  const setTheoryId = useDiagramStore((s) => s.setTheoryId);
  const [model, setModel] = useState<Model | null>(null);

  function clearDiagram() {
    // Preserve the model/theory selection; only wipe topology.
    const m = modelId;
    const t = theoryId;
    reset();
    if (m) setModelId(m);
    if (t) setTheoryId(t);
  }

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

  function onNewVertexDragStart(event: React.DragEvent) {
    event.dataTransfer.setData(NEW_VERTEX_DRAG_TYPE, "vertex");
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <div data-testid="toolbox" style={{ fontSize: 12 }}>
      <h4>Toolbox</h4>
      <button
        type="button"
        data-testid="clear-diagram"
        onClick={clearDiagram}
        style={{ marginBottom: 8, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}
      >
        Clear diagram
      </button>
      <div
        data-testid="new-vertex-drag-handle"
        draggable
        onDragStart={onNewVertexDragStart}
        style={{
          border: "1px dashed #888",
          padding: 8,
          textAlign: "center",
          cursor: "grab",
          marginBottom: 8,
          userSelect: "none",
        }}
        title="Drag onto the canvas to add a vertex"
      >
        + New vertex
        <div style={{ fontSize: 10, opacity: 0.6 }}>(drag onto canvas)</div>
      </div>

      <h4 style={{ marginTop: 16 }}>Particle palette</h4>
      {!model ? (
        <p style={{ opacity: 0.5, fontSize: 11 }}>
          Pick a model in Settings to see the particle list.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 10, opacity: 0.6, margin: "2px 0 6px" }}>
            Reference only: click an edge on the canvas to assign a particle.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {[...model.particles]
              .sort((a, b) => {
                const orderA = styleOrder(styleForPdg(a.pdg_id));
                const orderB = styleOrder(styleForPdg(b.pdg_id));
                if (orderA !== orderB) return orderA - orderB;
                return a.pdg_id - b.pdg_id;
              })
              .map((p) => (
                <li key={p.pdg_id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 0" }}>
                  <ParticleStrokePreview pdgId={p.pdg_id} />
                  <span style={{ minWidth: 60, fontFamily: "monospace" }}>{p.name}</span>
                  <span style={{ opacity: 0.5 }}>{p.pdg_id}</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

function styleOrder(s: ReturnType<typeof styleForPdg>): number {
  return { fermion: 0, photon: 1, gluon: 2, scalar: 3, ghost: 4, unknown: 5 }[s];
}

function ParticleStrokePreview({ pdgId }: { pdgId: number }) {
  const width = 50;
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
        <polygon points="0,-3.5 6,0 0,3.5" fill={visual.stroke} transform={`translate(${width / 2}, ${y})`} />
      )}
    </svg>
  );
}

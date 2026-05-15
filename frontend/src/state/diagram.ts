import { create } from "zustand";
import { relayout, spawnPositionForNewVertex } from "../canvas/layout";
import type { Model } from "../api/types";

export type VertexNode = {
  id: string;
  position: [number, number];
  ufoVertexId?: string;
};

export type ParticleEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  particlePdgId: number | null;
};

export type ExternalLeg = {
  nodeId: string;
  kind: "incoming" | "outgoing";
  label: string;
};

export type SelectionKind = "node" | "edge" | null;

/** Snapshot of the topology + routing override — what undo/redo restores. */
type DiagramSnapshot = {
  nodes: VertexNode[];
  edges: ParticleEdge[];
  externalLegs: ExternalLeg[];
  lmbEdgeIds: string[] | null;
};

const HISTORY_LIMIT = 50;

export type DiagramState = {
  modelId: string;
  theoryId: string;
  processName: string;
  nodes: VertexNode[];
  edges: ParticleEdge[];
  externalLegs: ExternalLeg[];
  /**
   * Custom loop momentum routing. When null, the backend auto-picks chord
   * edges via a spanning-tree algorithm. When a non-empty list, those edge
   * IDs are used as chords (backend validates them at export time).
   */
  lmbEdgeIds: string[] | null;
  /** Currently selected node or edge id (null = no selection). */
  selectedId: string | null;
  selectedKind: SelectionKind;
  /** Cached Model fetched by modelId; ParticleEdge / Toolbox / SelectionPanel
   *  read this to get particle names + style metadata. Refreshed in App.tsx
   *  whenever modelId changes. */
  cachedModel: Model | null;
  /** Bounded snapshot stacks for undo (past) and redo (future). Each entry
   *  freezes the topology (nodes/edges/externalLegs/lmbEdgeIds) just before
   *  the corresponding mutation. */
  _past: DiagramSnapshot[];
  _future: DiagramSnapshot[];

  setModelId: (id: string) => void;
  setCachedModel: (m: Model | null) => void;
  /** Run the force-directed layout against the current topology. Called
   *  automatically after structural changes; can also be invoked manually. */
  runLayout: () => void;
  setTheoryId: (id: string) => void;
  setProcessName: (name: string) => void;
  setLmbEdgeIds: (ids: string[] | null) => void;
  setSelection: (id: string | null, kind: SelectionKind) => void;
  addVertex: (v: VertexNode) => void;
  removeVertex: (id: string) => void;
  updateVertexPosition: (id: string, position: [number, number]) => void;
  addEdge: (e: Omit<ParticleEdge, "particlePdgId"> & { particlePdgId?: number | null }) => void;
  removeEdge: (id: string) => void;
  setEdgeParticle: (id: string, pdgId: number | null) => void;
  addExternalLeg: (leg: ExternalLeg) => void;
  removeExternalLeg: (nodeId: string) => void;
  /** Cycle a vertex's leg state: internal → incoming → outgoing → internal. */
  cycleLegKind: (nodeId: string) => void;
  /** Undo the last topology-changing action. Restores positions exactly,
   *  no layout re-run. */
  undo: () => void;
  /** Redo the last undone action. */
  redo: () => void;
  reset: () => void;
};

function snapshot(s: {
  nodes: VertexNode[];
  edges: ParticleEdge[];
  externalLegs: ExternalLeg[];
  lmbEdgeIds: string[] | null;
}): DiagramSnapshot {
  return {
    nodes: s.nodes.map((n) => ({ ...n, position: [n.position[0], n.position[1]] })),
    edges: s.edges.map((e) => ({ ...e })),
    externalLegs: s.externalLegs.map((l) => ({ ...l })),
    lmbEdgeIds: s.lmbEdgeIds ? [...s.lmbEdgeIds] : null,
  };
}

/** Bound the history; drop oldest entries past the limit. */
function pushHistory(past: DiagramSnapshot[], snap: DiagramSnapshot): DiagramSnapshot[] {
  const next = [...past, snap];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

const INITIAL = {
  modelId: "",
  theoryId: "qed",
  processName: "process",
  nodes: [] as VertexNode[],
  edges: [] as ParticleEdge[],
  externalLegs: [] as ExternalLeg[],
  lmbEdgeIds: null as string[] | null,
  selectedId: null as string | null,
  selectedKind: null as SelectionKind,
  cachedModel: null as Model | null,
  _past: [] as DiagramSnapshot[],
  _future: [] as DiagramSnapshot[],
};

export const useDiagramStore = create<DiagramState>((set) => ({
  ...INITIAL,
  setModelId: (id) => set({ modelId: id }),
  setTheoryId: (id) => set({ theoryId: id }),
  setProcessName: (name) => set({ processName: name }),
  setLmbEdgeIds: (ids) =>
    set((s) => ({
      lmbEdgeIds: ids,
      _past: pushHistory(s._past, snapshot(s)),
      _future: [],
    })),
  setSelection: (id, kind) => set({ selectedId: id, selectedKind: kind }),
  setCachedModel: (m) => set({ cachedModel: m }),
  runLayout: () =>
    set((s) => {
      const out = relayout(s.nodes, s.edges, s.externalLegs);
      return { nodes: out.nodes, externalLegs: out.externalLegs };
    }),
  addVertex: (v) =>
    set((s) => {
      const past = pushHistory(s._past, snapshot(s));
      const id = v.id;
      const position =
        v.position[0] === 0 && v.position[1] === 0
          ? spawnPositionForNewVertex(s.nodes)
          : v.position;
      const nextNodes = [...s.nodes, { ...v, position }];
      const laid = relayout(nextNodes, s.edges, s.externalLegs);
      return {
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        selectedId: id,
        selectedKind: "node",
        _past: past,
        _future: [],
      };
    }),
  removeVertex: (id) =>
    set((s) => {
      const past = pushHistory(s._past, snapshot(s));
      const nextNodes = s.nodes.filter((n) => n.id !== id);
      const nextEdges = s.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id);
      const nextLegs = s.externalLegs.filter((l) => l.nodeId !== id);
      const laid = relayout(nextNodes, nextEdges, nextLegs);
      return {
        nodes: laid.nodes,
        edges: nextEdges,
        externalLegs: laid.externalLegs,
        selectedId: s.selectedId === id ? null : s.selectedId,
        selectedKind: s.selectedId === id ? null : s.selectedKind,
        _past: past,
        _future: [],
      };
    }),
  updateVertexPosition: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      _past: pushHistory(s._past, snapshot(s)),
      _future: [],
    })),
  addEdge: (e) =>
    set((s) => {
      const past = pushHistory(s._past, snapshot(s));
      const nextEdges = [...s.edges, { particlePdgId: e.particlePdgId ?? null, ...e }];
      const laid = relayout(s.nodes, nextEdges, s.externalLegs);
      return {
        edges: nextEdges,
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        _past: past,
        _future: [],
      };
    }),
  removeEdge: (id) =>
    set((s) => {
      const past = pushHistory(s._past, snapshot(s));
      const nextEdges = s.edges.filter((e) => e.id !== id);
      const laid = relayout(s.nodes, nextEdges, s.externalLegs);
      return {
        edges: nextEdges,
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        selectedId: s.selectedId === id ? null : s.selectedId,
        selectedKind: s.selectedId === id ? null : s.selectedKind,
        _past: past,
        _future: [],
      };
    }),
  setEdgeParticle: (id, pdgId) =>
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, particlePdgId: pdgId } : e)),
      _past: pushHistory(s._past, snapshot(s)),
      _future: [],
    })),
  addExternalLeg: (leg) =>
    set((s) => {
      const past = pushHistory(s._past, snapshot(s));
      const nextLegs = [...s.externalLegs.filter((l) => l.nodeId !== leg.nodeId), leg];
      const laid = relayout(s.nodes, s.edges, nextLegs);
      return {
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        _past: past,
        _future: [],
      };
    }),
  removeExternalLeg: (nodeId) =>
    set((s) => {
      const past = pushHistory(s._past, snapshot(s));
      const nextLegs = s.externalLegs.filter((l) => l.nodeId !== nodeId);
      const laid = relayout(s.nodes, s.edges, nextLegs);
      return {
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        _past: past,
        _future: [],
      };
    }),
  cycleLegKind: (nodeId) =>
    set((s) => {
      const past = pushHistory(s._past, snapshot(s));
      const existing = s.externalLegs.find((l) => l.nodeId === nodeId);
      let nextLegs: typeof s.externalLegs;
      if (existing == null) {
        const nextNum =
          s.externalLegs.reduce((max, l) => {
            const n = Number(l.label.replace(/^p/, ""));
            return Number.isFinite(n) && n > max ? n : max;
          }, 0) + 1;
        nextLegs = [
          ...s.externalLegs,
          { nodeId, kind: "incoming", label: `p${nextNum}` },
        ];
      } else if (existing.kind === "incoming") {
        nextLegs = s.externalLegs.map((l) =>
          l.nodeId === nodeId ? { ...l, kind: "outgoing" } : l,
        );
      } else {
        nextLegs = s.externalLegs.filter((l) => l.nodeId !== nodeId);
      }
      const laid = relayout(s.nodes, s.edges, nextLegs);
      return {
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        _past: past,
        _future: [],
      };
    }),
  undo: () =>
    set((s) => {
      if (s._past.length === 0) return {};
      const previous = s._past[s._past.length - 1];
      const past = s._past.slice(0, -1);
      const future = pushHistory(s._future, snapshot(s));
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        externalLegs: previous.externalLegs,
        lmbEdgeIds: previous.lmbEdgeIds,
        _past: past,
        _future: future,
        selectedId: null,
        selectedKind: null,
      };
    }),
  redo: () =>
    set((s) => {
      if (s._future.length === 0) return {};
      const next = s._future[s._future.length - 1];
      const future = s._future.slice(0, -1);
      const past = pushHistory(s._past, snapshot(s));
      return {
        nodes: next.nodes,
        edges: next.edges,
        externalLegs: next.externalLegs,
        lmbEdgeIds: next.lmbEdgeIds,
        _past: past,
        _future: future,
        selectedId: null,
        selectedKind: null,
      };
    }),
  reset: () => set(INITIAL),
}));

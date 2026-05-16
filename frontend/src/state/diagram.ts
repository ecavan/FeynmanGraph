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
  lmbEdgeIds: string[] | null;
  selectedId: string | null;
  selectedKind: SelectionKind;
  cachedModel: Model | null;
  // Click-to-create-edge mode. When `edgeDraftActive` is true and
  // `edgeDraftSource` is null, the next vertex click sets the source. When
  // both are set, the next vertex click finalizes the edge.
  edgeDraftActive: boolean;
  edgeDraftSource: string | null;
  _past: DiagramSnapshot[];
  _future: DiagramSnapshot[];

  setModelId: (id: string) => void;
  setCachedModel: (m: Model | null) => void;
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
  cycleLegKind: (nodeId: string) => void;
  startEdgeDraft: () => void;
  cancelEdgeDraft: () => void;
  pickEdgeDraftVertex: (vertexId: string) => void;
  addSelfLoop: (vertexId: string) => string | null;
  duplicateEdge: (edgeId: string) => string | null;
  undo: () => void;
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
  edgeDraftActive: false,
  edgeDraftSource: null as string | null,
  _past: [] as DiagramSnapshot[],
  _future: [] as DiagramSnapshot[],
};

function nextEdgeId(existing: string[]): string {
  const used = new Set<number>();
  for (const id of existing) {
    const m = id.match(/^e(\d+)$/);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `e${n}`;
}

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
      const position =
        v.position[0] === 0 && v.position[1] === 0
          ? spawnPositionForNewVertex(s.nodes)
          : v.position;
      const nextNodes = [...s.nodes, { ...v, position }];
      const laid = relayout(nextNodes, s.edges, s.externalLegs);
      return {
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        selectedId: v.id,
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
        nextLegs = [...s.externalLegs, { nodeId, kind: "incoming", label: `p${nextNum}` }];
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
  startEdgeDraft: () =>
    set({ edgeDraftActive: true, edgeDraftSource: null, selectedId: null, selectedKind: null }),
  cancelEdgeDraft: () =>
    set({ edgeDraftActive: false, edgeDraftSource: null }),
  pickEdgeDraftVertex: (vertexId) =>
    set((s) => {
      if (!s.edgeDraftActive) return {};
      if (s.edgeDraftSource == null) {
        return { edgeDraftSource: vertexId };
      }
      const past = pushHistory(s._past, snapshot(s));
      const newId = nextEdgeId(s.edges.map((e) => e.id));
      const nextEdges = [
        ...s.edges,
        {
          id: newId,
          sourceNodeId: s.edgeDraftSource,
          targetNodeId: vertexId,
          particlePdgId: null,
        },
      ];
      const laid = relayout(s.nodes, nextEdges, s.externalLegs);
      return {
        edges: nextEdges,
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        edgeDraftActive: false,
        edgeDraftSource: null,
        selectedId: newId,
        selectedKind: "edge" as SelectionKind,
        _past: past,
        _future: [],
      };
    }),
  addSelfLoop: (vertexId) => {
    let newId: string | null = null;
    set((s) => {
      if (!s.nodes.some((n) => n.id === vertexId)) return {};
      const past = pushHistory(s._past, snapshot(s));
      newId = nextEdgeId(s.edges.map((e) => e.id));
      const nextEdges = [
        ...s.edges,
        { id: newId, sourceNodeId: vertexId, targetNodeId: vertexId, particlePdgId: null },
      ];
      const laid = relayout(s.nodes, nextEdges, s.externalLegs);
      return {
        edges: nextEdges,
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        selectedId: newId,
        selectedKind: "edge" as SelectionKind,
        _past: past,
        _future: [],
      };
    });
    return newId;
  },
  duplicateEdge: (edgeId) => {
    let newId: string | null = null;
    set((s) => {
      const original = s.edges.find((e) => e.id === edgeId);
      if (!original) return {};
      const past = pushHistory(s._past, snapshot(s));
      newId = nextEdgeId(s.edges.map((e) => e.id));
      const nextEdges = [
        ...s.edges,
        {
          id: newId,
          sourceNodeId: original.sourceNodeId,
          targetNodeId: original.targetNodeId,
          particlePdgId: original.particlePdgId,
        },
      ];
      const laid = relayout(s.nodes, nextEdges, s.externalLegs);
      return {
        edges: nextEdges,
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        selectedId: newId,
        selectedKind: "edge" as SelectionKind,
        _past: past,
        _future: [],
      };
    });
    return newId;
  },
  undo: () =>
    set((s) => {
      if (s._past.length === 0) return {};
      const previous = s._past[s._past.length - 1];
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        externalLegs: previous.externalLegs,
        lmbEdgeIds: previous.lmbEdgeIds,
        _past: s._past.slice(0, -1),
        _future: pushHistory(s._future, snapshot(s)),
        selectedId: null,
        selectedKind: null,
      };
    }),
  redo: () =>
    set((s) => {
      if (s._future.length === 0) return {};
      const next = s._future[s._future.length - 1];
      return {
        nodes: next.nodes,
        edges: next.edges,
        externalLegs: next.externalLegs,
        lmbEdgeIds: next.lmbEdgeIds,
        _past: pushHistory(s._past, snapshot(s)),
        _future: s._future.slice(0, -1),
        selectedId: null,
        selectedKind: null,
      };
    }),
  reset: () => set(INITIAL),
}));

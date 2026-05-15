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
  reset: () => void;
};

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
};

export const useDiagramStore = create<DiagramState>((set) => ({
  ...INITIAL,
  setModelId: (id) => set({ modelId: id }),
  setTheoryId: (id) => set({ theoryId: id }),
  setProcessName: (name) => set({ processName: name }),
  setLmbEdgeIds: (ids) => set({ lmbEdgeIds: ids }),
  setSelection: (id, kind) => set({ selectedId: id, selectedKind: kind }),
  setCachedModel: (m) => set({ cachedModel: m }),
  runLayout: () =>
    set((s) => {
      const out = relayout(s.nodes, s.edges, s.externalLegs);
      return { nodes: out.nodes, externalLegs: out.externalLegs };
    }),
  addVertex: (v) =>
    set((s) => {
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
      };
    }),
  removeVertex: (id) =>
    set((s) => {
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
      };
    }),
  updateVertexPosition: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    })),
  addEdge: (e) =>
    set((s) => {
      const nextEdges = [...s.edges, { particlePdgId: e.particlePdgId ?? null, ...e }];
      const laid = relayout(s.nodes, nextEdges, s.externalLegs);
      return { edges: nextEdges, nodes: laid.nodes, externalLegs: laid.externalLegs };
    }),
  removeEdge: (id) =>
    set((s) => {
      const nextEdges = s.edges.filter((e) => e.id !== id);
      const laid = relayout(s.nodes, nextEdges, s.externalLegs);
      return {
        edges: nextEdges,
        nodes: laid.nodes,
        externalLegs: laid.externalLegs,
        selectedId: s.selectedId === id ? null : s.selectedId,
        selectedKind: s.selectedId === id ? null : s.selectedKind,
      };
    }),
  setEdgeParticle: (id, pdgId) =>
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, particlePdgId: pdgId } : e)),
    })),
  addExternalLeg: (leg) =>
    set((s) => {
      const nextLegs = [...s.externalLegs.filter((l) => l.nodeId !== leg.nodeId), leg];
      const laid = relayout(s.nodes, s.edges, nextLegs);
      return { nodes: laid.nodes, externalLegs: laid.externalLegs };
    }),
  removeExternalLeg: (nodeId) =>
    set((s) => {
      const nextLegs = s.externalLegs.filter((l) => l.nodeId !== nodeId);
      const laid = relayout(s.nodes, s.edges, nextLegs);
      return { nodes: laid.nodes, externalLegs: laid.externalLegs };
    }),
  cycleLegKind: (nodeId) =>
    set((s) => {
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
      return { nodes: laid.nodes, externalLegs: laid.externalLegs };
    }),
  reset: () => set(INITIAL),
}));

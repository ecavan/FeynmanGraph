import { create } from "zustand";

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

  setModelId: (id: string) => void;
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
};

export const useDiagramStore = create<DiagramState>((set) => ({
  ...INITIAL,
  setModelId: (id) => set({ modelId: id }),
  setTheoryId: (id) => set({ theoryId: id }),
  setProcessName: (name) => set({ processName: name }),
  setLmbEdgeIds: (ids) => set({ lmbEdgeIds: ids }),
  setSelection: (id, kind) => set({ selectedId: id, selectedKind: kind }),
  addVertex: (v) => set((s) => ({ nodes: [...s.nodes, v] })),
  removeVertex: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id),
      externalLegs: s.externalLegs.filter((l) => l.nodeId !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedKind: s.selectedId === id ? null : s.selectedKind,
    })),
  updateVertexPosition: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    })),
  addEdge: (e) =>
    set((s) => ({
      edges: [...s.edges, { particlePdgId: e.particlePdgId ?? null, ...e }],
    })),
  removeEdge: (id) =>
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedKind: s.selectedId === id ? null : s.selectedKind,
    })),
  setEdgeParticle: (id, pdgId) =>
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, particlePdgId: pdgId } : e)),
    })),
  addExternalLeg: (leg) =>
    set((s) => ({
      externalLegs: [...s.externalLegs.filter((l) => l.nodeId !== leg.nodeId), leg],
    })),
  removeExternalLeg: (nodeId) =>
    set((s) => ({ externalLegs: s.externalLegs.filter((l) => l.nodeId !== nodeId) })),
  cycleLegKind: (nodeId) =>
    set((s) => {
      const existing = s.externalLegs.find((l) => l.nodeId === nodeId);
      if (existing == null) {
        // internal → incoming
        const nextNum =
          s.externalLegs.reduce((max, l) => {
            const n = Number(l.label.replace(/^p/, ""));
            return Number.isFinite(n) && n > max ? n : max;
          }, 0) + 1;
        return {
          externalLegs: [
            ...s.externalLegs,
            { nodeId, kind: "incoming", label: `p${nextNum}` },
          ],
        };
      }
      if (existing.kind === "incoming") {
        // incoming → outgoing (keep label)
        return {
          externalLegs: s.externalLegs.map((l) =>
            l.nodeId === nodeId ? { ...l, kind: "outgoing" } : l,
          ),
        };
      }
      // outgoing → internal (remove the leg)
      return { externalLegs: s.externalLegs.filter((l) => l.nodeId !== nodeId) };
    }),
  reset: () => set(INITIAL),
}));

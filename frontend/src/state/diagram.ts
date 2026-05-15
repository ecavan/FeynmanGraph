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

  setModelId: (id: string) => void;
  setTheoryId: (id: string) => void;
  setProcessName: (name: string) => void;
  setLmbEdgeIds: (ids: string[] | null) => void;
  addVertex: (v: VertexNode) => void;
  removeVertex: (id: string) => void;
  addEdge: (e: Omit<ParticleEdge, "particlePdgId"> & { particlePdgId?: number | null }) => void;
  removeEdge: (id: string) => void;
  setEdgeParticle: (id: string, pdgId: number | null) => void;
  addExternalLeg: (leg: ExternalLeg) => void;
  removeExternalLeg: (nodeId: string) => void;
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
};

export const useDiagramStore = create<DiagramState>((set) => ({
  ...INITIAL,
  setModelId: (id) => set({ modelId: id }),
  setTheoryId: (id) => set({ theoryId: id }),
  setProcessName: (name) => set({ processName: name }),
  setLmbEdgeIds: (ids) => set({ lmbEdgeIds: ids }),
  addVertex: (v) => set((s) => ({ nodes: [...s.nodes, v] })),
  removeVertex: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id),
      externalLegs: s.externalLegs.filter((l) => l.nodeId !== id),
    })),
  addEdge: (e) =>
    set((s) => ({
      edges: [...s.edges, { particlePdgId: e.particlePdgId ?? null, ...e }],
    })),
  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  setEdgeParticle: (id, pdgId) =>
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, particlePdgId: pdgId } : e)),
    })),
  addExternalLeg: (leg) => set((s) => ({ externalLegs: [...s.externalLegs, leg] })),
  removeExternalLeg: (nodeId) =>
    set((s) => ({ externalLegs: s.externalLegs.filter((l) => l.nodeId !== nodeId) })),
  reset: () => set(INITIAL),
}));

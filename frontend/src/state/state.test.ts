import { beforeEach, describe, expect, it } from "vitest";
import type { ExampleSpec } from "../api/types";
import { useDiagramStore } from "./diagram";
import { useGalleryStore } from "./gallery";
import { restoreFromLocalStorage, saveToLocalStorage, STORAGE_KEY } from "./persistence";

describe("diagram store", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("starts empty", () => {
    const s = useDiagramStore.getState();
    expect(s.nodes).toEqual([]);
    expect(s.edges).toEqual([]);
    expect(s.externalLegs).toEqual([]);
  });

  it("adds a vertex", () => {
    useDiagramStore.getState().addVertex({ id: "v1", position: [0, 0] });
    expect(useDiagramStore.getState().nodes).toHaveLength(1);
  });

  it("connects two vertices with an edge", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [100, 0] });
    s.addEdge({ id: "e1", sourceNodeId: "v1", targetNodeId: "v2" });
    expect(useDiagramStore.getState().edges).toHaveLength(1);
  });

  it("sets an edge's particle", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [100, 0] });
    s.addEdge({ id: "e1", sourceNodeId: "v1", targetNodeId: "v2" });
    s.setEdgeParticle("e1", 22);
    expect(useDiagramStore.getState().edges[0].particlePdgId).toBe(22);
  });

  describe("isCut pairing", () => {
    function setupTwoEdges() {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      s.addVertex({ id: "v2", position: [100, 0] });
      s.addVertex({ id: "v3", position: [0, 100] });
      s.addVertex({ id: "v4", position: [100, 100] });
      s.addEdge({ id: "e1", sourceNodeId: "v1", targetNodeId: "v2" });
      s.addEdge({ id: "e2", sourceNodeId: "v3", targetNodeId: "v4" });
    }

    it("setEdgeCutPair labels both edges with the same shared cutLabel", () => {
      setupTwoEdges();
      useDiagramStore.getState().setEdgeCutPair("e1", "e2");
      const edges = useDiagramStore.getState().edges;
      expect(edges.find((e) => e.id === "e1")?.cutLabel).toBe("e1");
      expect(edges.find((e) => e.id === "e2")?.cutLabel).toBe("e1");
    });

    it("setEdgeCutPair uses the alphabetically-first edge id regardless of click order", () => {
      setupTwoEdges();
      useDiagramStore.getState().setEdgeCutPair("e2", "e1");
      expect(useDiagramStore.getState().edges.find((e) => e.id === "e1")?.cutLabel).toBe("e1");
    });

    it("clearEdgeCutPair removes the label from both edges", () => {
      setupTwoEdges();
      const s = useDiagramStore.getState();
      s.setEdgeCutPair("e1", "e2");
      s.clearEdgeCutPair("e1");
      const edges = useDiagramStore.getState().edges;
      expect(edges.find((e) => e.id === "e1")?.cutLabel).toBeNull();
      expect(edges.find((e) => e.id === "e2")?.cutLabel).toBeNull();
    });

    it("re-pairing strips the label from a third orphan edge so cuts stay 2-way", () => {
      setupTwoEdges();
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v5", position: [200, 0] });
      s.addVertex({ id: "v6", position: [200, 100] });
      s.addEdge({ id: "e3", sourceNodeId: "v5", targetNodeId: "v6" });
      s.setEdgeCutPair("e1", "e2");
      s.setEdgeCutPair("e1", "e3");
      const edges = useDiagramStore.getState().edges;
      expect(edges.find((e) => e.id === "e1")?.cutLabel).toBe("e1");
      expect(edges.find((e) => e.id === "e3")?.cutLabel).toBe("e1");
      expect(edges.find((e) => e.id === "e2")?.cutLabel).toBeNull();
    });

    it("setEdgeCutPair is a no-op if you try to pair an edge with itself", () => {
      setupTwoEdges();
      useDiagramStore.getState().setEdgeCutPair("e1", "e1");
      expect(useDiagramStore.getState().edges.find((e) => e.id === "e1")?.cutLabel ?? null).toBeNull();
    });
  });

  it("removing a vertex also removes its incident edges and external legs", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [100, 0] });
    s.addEdge({ id: "e1", sourceNodeId: "v1", targetNodeId: "v2" });
    s.addExternalLeg({ nodeId: "v1", kind: "incoming", label: "p1" });
    s.removeVertex("v1");
    const state = useDiagramStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.edges).toHaveLength(0);
    expect(state.externalLegs).toHaveLength(0);
  });

  it("removing a vertex clears it from selection if it was selected", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.setSelection("v1", "node");
    s.removeVertex("v1");
    expect(useDiagramStore.getState().selectedId).toBeNull();
  });

  it("cycleLegKind walks internal → incoming → outgoing → internal", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });

    s.cycleLegKind("v1");
    expect(useDiagramStore.getState().externalLegs[0]).toMatchObject({ kind: "incoming", label: "p1" });
    s.cycleLegKind("v1");
    expect(useDiagramStore.getState().externalLegs[0].kind).toBe("outgoing");
    s.cycleLegKind("v1");
    expect(useDiagramStore.getState().externalLegs).toHaveLength(0);
  });

  it("cycleLegKind hands out ascending labels p1, p2…", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [100, 0] });
    s.cycleLegKind("v1");
    s.cycleLegKind("v2");
    const legs = useDiagramStore.getState().externalLegs;
    expect(legs.find((l) => l.nodeId === "v1")?.label).toBe("p1");
    expect(legs.find((l) => l.nodeId === "v2")?.label).toBe("p2");
  });

  it("addExternalLeg replaces an existing leg for the same node", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addExternalLeg({ nodeId: "v1", kind: "incoming", label: "p1" });
    s.addExternalLeg({ nodeId: "v1", kind: "outgoing", label: "p1" });
    const legs = useDiagramStore.getState().externalLegs;
    expect(legs).toHaveLength(1);
    expect(legs[0].kind).toBe("outgoing");
  });

  it("updateVertexPosition mutates the node", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.updateVertexPosition("v1", [200, 150]);
    expect(useDiagramStore.getState().nodes[0].position).toEqual([200, 150]);
  });

  it("undo restores state from before the last mutation", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [0, 0] });
    useDiagramStore.getState().undo();
    expect(useDiagramStore.getState().nodes).toHaveLength(1);
    useDiagramStore.getState().undo();
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
  });

  it("redo re-applies an undone mutation", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [0, 0] });
    useDiagramStore.getState().undo();
    useDiagramStore.getState().redo();
    expect(useDiagramStore.getState().nodes).toHaveLength(2);
  });

  it("a fresh mutation clears the redo stack", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [0, 0] });
    useDiagramStore.getState().undo();
    useDiagramStore.getState().addVertex({ id: "v3", position: [0, 0] });
    expect(useDiagramStore.getState()._future).toHaveLength(0);
  });

  it("undo is a no-op when history is empty", () => {
    useDiagramStore.getState().undo();
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
  });

  it("history is bounded", () => {
    const s = useDiagramStore.getState();
    for (let i = 0; i < 80; i++) s.addVertex({ id: `vN${i}`, position: [0, 0] });
    expect(useDiagramStore.getState()._past.length).toBeLessThanOrEqual(50);
  });

  describe("edge draft (click-to-create)", () => {
    it("starts inactive with no source", () => {
      const s = useDiagramStore.getState();
      expect(s.edgeDraftActive).toBe(false);
      expect(s.edgeDraftSource).toBeNull();
    });

    it("startEdgeDraft activates and clears any selection", () => {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      s.setSelection("v1", "node");
      s.startEdgeDraft();
      const after = useDiagramStore.getState();
      expect(after.edgeDraftActive).toBe(true);
      expect(after.edgeDraftSource).toBeNull();
      expect(after.selectedId).toBeNull();
    });

    it("first vertex click sets source, second creates edge and selects it", () => {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      s.addVertex({ id: "v2", position: [100, 0] });
      s.startEdgeDraft();
      s.pickEdgeDraftVertex("v1");
      expect(useDiagramStore.getState().edgeDraftSource).toBe("v1");
      s.pickEdgeDraftVertex("v2");
      const after = useDiagramStore.getState();
      expect(after.edgeDraftActive).toBe(false);
      expect(after.edgeDraftSource).toBeNull();
      expect(after.edges).toHaveLength(1);
      expect(after.edges[0].sourceNodeId).toBe("v1");
      expect(after.edges[0].targetNodeId).toBe("v2");
      expect(after.edges[0].particlePdgId).toBeNull();
      expect(after.selectedKind).toBe("edge");
      expect(after.selectedId).toBe(after.edges[0].id);
    });

    it("clicking the same vertex twice creates a self-loop", () => {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      s.startEdgeDraft();
      s.pickEdgeDraftVertex("v1");
      s.pickEdgeDraftVertex("v1");
      const e = useDiagramStore.getState().edges[0];
      expect(e.sourceNodeId).toBe("v1");
      expect(e.targetNodeId).toBe("v1");
    });

    it("cancelEdgeDraft drops the in-progress state", () => {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      s.startEdgeDraft();
      s.pickEdgeDraftVertex("v1");
      s.cancelEdgeDraft();
      const after = useDiagramStore.getState();
      expect(after.edgeDraftActive).toBe(false);
      expect(after.edgeDraftSource).toBeNull();
      expect(after.edges).toHaveLength(0);
    });

    it("pickEdgeDraftVertex is a no-op when not in draft mode", () => {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      s.pickEdgeDraftVertex("v1");
      expect(useDiagramStore.getState().edges).toHaveLength(0);
    });
  });

  describe("external leg helpers", () => {
    it("addIncomingLeg adds a vertex + incoming leg in one step and selects it", () => {
      const s = useDiagramStore.getState();
      const id = s.addIncomingLeg();
      const after = useDiagramStore.getState();
      expect(after.nodes).toHaveLength(1);
      expect(after.nodes[0].id).toBe(id);
      expect(after.externalLegs).toHaveLength(1);
      expect(after.externalLegs[0]).toMatchObject({ nodeId: id, kind: "incoming", label: "p1" });
      expect(after.selectedId).toBe(id);
      expect(after.selectedKind).toBe("node");
    });

    it("addOutgoingLeg adds a vertex + outgoing leg and selects it", () => {
      const s = useDiagramStore.getState();
      const id = s.addOutgoingLeg();
      const after = useDiagramStore.getState();
      expect(after.externalLegs[0]).toMatchObject({ nodeId: id, kind: "outgoing", label: "p1" });
      expect(after.selectedId).toBe(id);
    });

    it("consecutive leg adds hand out ascending p-labels", () => {
      const s = useDiagramStore.getState();
      s.addIncomingLeg();
      s.addIncomingLeg();
      s.addOutgoingLeg();
      const labels = useDiagramStore.getState().externalLegs.map((l) => l.label);
      expect(labels).toEqual(["p1", "p2", "p3"]);
    });

    it("undo after addIncomingLeg removes both the vertex and the leg", () => {
      const s = useDiagramStore.getState();
      s.addIncomingLeg();
      expect(useDiagramStore.getState().nodes).toHaveLength(1);
      expect(useDiagramStore.getState().externalLegs).toHaveLength(1);
      useDiagramStore.getState().undo();
      const after = useDiagramStore.getState();
      expect(after.nodes).toEqual([]);
      expect(after.externalLegs).toEqual([]);
    });
  });

  describe("loop helpers", () => {
    it("addSelfLoop adds a self-edge on the given vertex and selects it", () => {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      const id = s.addSelfLoop("v1");
      const after = useDiagramStore.getState();
      expect(id).not.toBeNull();
      expect(after.edges).toHaveLength(1);
      expect(after.edges[0].sourceNodeId).toBe("v1");
      expect(after.edges[0].targetNodeId).toBe("v1");
      expect(after.selectedId).toBe(id);
      expect(after.selectedKind).toBe("edge");
    });

    it("addSelfLoop is a no-op for an unknown vertex", () => {
      const s = useDiagramStore.getState();
      const id = s.addSelfLoop("ghost");
      expect(id).toBeNull();
      expect(useDiagramStore.getState().edges).toHaveLength(0);
    });

    it("duplicateEdge creates a parallel edge with the same particle", () => {
      const s = useDiagramStore.getState();
      s.addVertex({ id: "v1", position: [0, 0] });
      s.addVertex({ id: "v2", position: [100, 0] });
      s.addEdge({ id: "e1", sourceNodeId: "v1", targetNodeId: "v2", particlePdgId: 22 });
      const newId = s.duplicateEdge("e1");
      const after = useDiagramStore.getState();
      expect(newId).not.toBeNull();
      expect(after.edges).toHaveLength(2);
      const newEdge = after.edges.find((e) => e.id === newId);
      expect(newEdge?.sourceNodeId).toBe("v1");
      expect(newEdge?.targetNodeId).toBe("v2");
      expect(newEdge?.particlePdgId).toBe(22);
      expect(after.selectedId).toBe(newId);
    });

    it("duplicateEdge is a no-op for an unknown edge", () => {
      const s = useDiagramStore.getState();
      const id = s.duplicateEdge("ghost");
      expect(id).toBeNull();
    });
  });
});

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    useDiagramStore.getState().reset();
  });

  it("roundtrips a diagram through localStorage", () => {
    const s = useDiagramStore.getState();
    s.setModelId("sm");
    s.addVertex({ id: "v1", position: [0, 0] });
    saveToLocalStorage();
    s.reset();
    expect(restoreFromLocalStorage()).toBe(true);
    expect(useDiagramStore.getState().modelId).toBe("sm");
    expect(useDiagramStore.getState().nodes).toHaveLength(1);
  });

  it("returns false on missing data", () => {
    expect(restoreFromLocalStorage()).toBe(false);
  });

  it("returns false on corrupt data", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(restoreFromLocalStorage()).toBe(false);
  });
});

function fakeSpec(name: string): ExampleSpec {
  return {
    model_id: "sm",
    theory_id: "qed",
    process_name: name,
    nodes: [],
    edges: [],
    external_legs: [],
  };
}

describe("gallery store", () => {
  beforeEach(() => useGalleryStore.getState().clear());

  it("starts empty", () => {
    const s = useGalleryStore.getState();
    expect(s.diagrams).toEqual([]);
    expect(s.count).toBe(0);
    expect(s.truncated).toBe(false);
    expect(s.archiveName).toBe("diagrams");
    expect(s.loadedSpecId).toBeNull();
  });

  it("setResult writes a result and resets loadedSpecId", () => {
    useGalleryStore.getState().setLoaded("stale");
    useGalleryStore.getState().setResult({
      diagrams: [fakeSpec("a"), fakeSpec("b")],
      count: 2,
      truncated: false,
      archiveName: "ee_to_mumu_L0",
    });
    const s = useGalleryStore.getState();
    expect(s.diagrams).toHaveLength(2);
    expect(s.count).toBe(2);
    expect(s.archiveName).toBe("ee_to_mumu_L0");
    expect(s.loadedSpecId).toBeNull();
  });

  it("setLoaded marks the current spec", () => {
    useGalleryStore.getState().setLoaded("ee_mumu");
    expect(useGalleryStore.getState().loadedSpecId).toBe("ee_mumu");
  });

  it("clear resets to initial state", () => {
    useGalleryStore.getState().setResult({
      diagrams: [fakeSpec("x")],
      count: 1,
      truncated: true,
      archiveName: "x",
    });
    useGalleryStore.getState().setLoaded("x");
    useGalleryStore.getState().clear();
    const s = useGalleryStore.getState();
    expect(s.diagrams).toEqual([]);
    expect(s.count).toBe(0);
    expect(s.truncated).toBe(false);
    expect(s.archiveName).toBe("diagrams");
    expect(s.loadedSpecId).toBeNull();
  });

  it("preserves truncated flag", () => {
    useGalleryStore.getState().setResult({
      diagrams: [fakeSpec("a")],
      count: 1,
      truncated: true,
      archiveName: "x",
    });
    expect(useGalleryStore.getState().truncated).toBe(true);
  });
});

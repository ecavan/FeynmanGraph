import { beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "./diagram";
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

import { beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "./diagram";

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
});

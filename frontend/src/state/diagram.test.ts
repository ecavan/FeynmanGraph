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

  it("removing a vertex clears it from selection if it was selected", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.setSelection("v1", "node");
    s.removeVertex("v1");
    const state = useDiagramStore.getState();
    expect(state.selectedId).toBeNull();
    expect(state.selectedKind).toBeNull();
  });

  it("cycleLegKind: internal → incoming → outgoing → internal", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    expect(useDiagramStore.getState().externalLegs).toHaveLength(0);

    s.cycleLegKind("v1");
    let leg = useDiagramStore.getState().externalLegs[0];
    expect(leg.kind).toBe("incoming");
    expect(leg.label).toBe("p1");

    s.cycleLegKind("v1");
    leg = useDiagramStore.getState().externalLegs[0];
    expect(leg.kind).toBe("outgoing");
    expect(leg.label).toBe("p1");

    s.cycleLegKind("v1");
    expect(useDiagramStore.getState().externalLegs).toHaveLength(0);
  });

  it("cycleLegKind assigns ascending labels when called on multiple vertices", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addVertex({ id: "v2", position: [100, 0] });
    s.cycleLegKind("v1");
    s.cycleLegKind("v2");
    const legs = useDiagramStore.getState().externalLegs;
    expect(legs.find((l) => l.nodeId === "v1")?.label).toBe("p1");
    expect(legs.find((l) => l.nodeId === "v2")?.label).toBe("p2");
  });

  it("addExternalLeg replaces an existing leg for the same node (no duplicates)", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addExternalLeg({ nodeId: "v1", kind: "incoming", label: "p1" });
    s.addExternalLeg({ nodeId: "v1", kind: "outgoing", label: "p1" });
    const legs = useDiagramStore.getState().externalLegs;
    expect(legs).toHaveLength(1);
    expect(legs[0].kind).toBe("outgoing");
  });

  it("updateVertexPosition mutates the node in place", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.updateVertexPosition("v1", [200, 150]);
    const node = useDiagramStore.getState().nodes[0];
    expect(node.position).toEqual([200, 150]);
  });
});

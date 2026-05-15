import { describe, expect, it } from "vitest";
import { relayout, spawnPositionForNewVertex } from "./layout";

describe("relayout", () => {
  it("returns unchanged structure for empty input", () => {
    const out = relayout([], [], []);
    expect(out.nodes).toEqual([]);
    expect(out.externalLegs).toEqual([]);
  });

  it("pins incoming legs on the left margin and outgoing on the right", () => {
    const nodes = [
      { id: "in1", position: [0, 0] as [number, number] },
      { id: "in2", position: [0, 0] as [number, number] },
      { id: "out1", position: [0, 0] as [number, number] },
      { id: "out2", position: [0, 0] as [number, number] },
    ];
    const legs = [
      { nodeId: "in1", kind: "incoming" as const, label: "p1" },
      { nodeId: "in2", kind: "incoming" as const, label: "p2" },
      { nodeId: "out1", kind: "outgoing" as const, label: "p3" },
      { nodeId: "out2", kind: "outgoing" as const, label: "p4" },
    ];
    const out = relayout(nodes, [], legs);
    const byId = Object.fromEntries(out.nodes.map((n) => [n.id, n.position]));
    expect(byId.in1[0]).toBe(-260);
    expect(byId.in2[0]).toBe(-260);
    expect(byId.out1[0]).toBe(260);
    expect(byId.out2[0]).toBe(260);
    // Vertically separated
    expect(byId.in1[1]).not.toBe(byId.in2[1]);
  });

  it("keeps internal vertices near the centroid even without edges (centering force)", () => {
    const nodes = [
      { id: "v1", position: [0, 0] as [number, number] },
      { id: "v2", position: [0, 0] as [number, number] },
      { id: "v3", position: [0, 0] as [number, number] },
    ];
    const out = relayout(nodes, [], []);
    for (const n of out.nodes) {
      // Centering keeps them within a small radius of origin
      expect(Math.hypot(n.position[0], n.position[1])).toBeLessThan(250);
    }
  });

  it("triangle of edges produces 3 distinct positions (force simulation converges)", () => {
    const nodes = [
      { id: "v1", position: [0, 0] as [number, number] },
      { id: "v2", position: [0, 0] as [number, number] },
      { id: "v3", position: [0, 0] as [number, number] },
    ];
    const edges = [
      { id: "e1", sourceNodeId: "v1", targetNodeId: "v2", particlePdgId: null },
      { id: "e2", sourceNodeId: "v2", targetNodeId: "v3", particlePdgId: null },
      { id: "e3", sourceNodeId: "v3", targetNodeId: "v1", particlePdgId: null },
    ];
    const out = relayout(nodes, edges, []);
    const positions = out.nodes.map((n) => n.position);
    // All three should be at different positions
    expect(positions[0]).not.toEqual(positions[1]);
    expect(positions[1]).not.toEqual(positions[2]);
    expect(positions[0]).not.toEqual(positions[2]);
  });
});

describe("spawnPositionForNewVertex", () => {
  it("returns the origin for an empty diagram", () => {
    expect(spawnPositionForNewVertex([])).toEqual([0, 0]);
  });

  it("returns a position offset from the centroid of existing vertices", () => {
    const existing = [
      { id: "v1", position: [100, 100] as [number, number] },
      { id: "v2", position: [-100, 100] as [number, number] },
    ];
    const [x, y] = spawnPositionForNewVertex(existing);
    // Centroid is (0, 100); offset should be roughly 60 from it
    expect(Math.hypot(x - 0, y - 100)).toBeCloseTo(60, 1);
  });
});

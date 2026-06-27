import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { DiagramCanvas } from "./DiagramCanvas";
import { relayout, spawnPositionForNewVertex } from "./layout";
import {
  circleSpine,
  coilPath,
  isGhostOrGoldstone,
  paletteSortKey,
  particleLabel,
  quadraticSpine,
  straightSpine,
  styleForPdg,
  visualForEdge,
  visualForSpine,
  wavyOnSpine,
  wavyPath,
} from "./edges/particle-style";

describe("relayout", () => {
  it("returns unchanged structure for empty input", () => {
    const out = relayout([], [], []);
    expect(out.nodes).toEqual([]);
    expect(out.externalLegs).toEqual([]);
  });

  it("pins incoming legs left and outgoing right", () => {
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
    expect(byId.out1[0]).toBe(260);
    expect(byId.in1[1]).not.toBe(byId.in2[1]);
  });

  it("triangle of edges produces 3 distinct positions", () => {
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
    const positions = relayout(nodes, edges, [], { reset: true }).nodes.map((n) => n.position);
    expect(positions[0]).not.toEqual(positions[1]);
    expect(positions[1]).not.toEqual(positions[2]);
  });

  it("keeps disconnected internal vertices near origin (centering force)", () => {
    const nodes = [
      { id: "v1", position: [0, 0] as [number, number] },
      { id: "v2", position: [0, 0] as [number, number] },
    ];
    for (const n of relayout(nodes, [], [], { reset: true }).nodes) {
      expect(Math.hypot(n.position[0], n.position[1])).toBeLessThan(250);
    }
  });
});

describe("spawnPositionForNewVertex", () => {
  it("origin for an empty diagram", () => {
    expect(spawnPositionForNewVertex([])).toEqual([0, 0]);
  });

  it("offset from the centroid of existing vertices", () => {
    const existing = [
      { id: "v1", position: [100, 100] as [number, number] },
      { id: "v2", position: [-100, 100] as [number, number] },
    ];
    const [x, y] = spawnPositionForNewVertex(existing);
    expect(Math.hypot(x, y - 100)).toBeCloseTo(60, 1);
  });
});

describe("styleForPdg", () => {
  it("classifies SM bosons", () => {
    expect(styleForPdg(21)).toBe("gluon");
    expect(styleForPdg(22)).toBe("photon");
    expect(styleForPdg(23)).toBe("zboson");
    expect(styleForPdg(24)).toBe("wboson");
    expect(styleForPdg(-24)).toBe("wboson");
    expect(styleForPdg(25)).toBe("scalar");
  });

  it("classifies quarks and leptons as fermions", () => {
    for (const pdg of [1, -6, 11, -16]) expect(styleForPdg(pdg)).toBe("fermion");
  });

  it("returns 'unknown' for null and exotic PDG", () => {
    expect(styleForPdg(null)).toBe("unknown");
    expect(styleForPdg(99)).toBe("unknown");
  });
});

describe("wavyPath and coilPath", () => {
  it("wavyPath starts at the source and has many segments", () => {
    const d = wavyPath(0, 0, 100, 0);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect((d.match(/ L /g) ?? []).length).toBeGreaterThan(10);
  });

  it("coilPath samples densely along the helix", () => {
    const d = coilPath(0, 0, 100, 0);
    expect((d.match(/ L /g) ?? []).length).toBeGreaterThan(40);
  });

  it("both degenerate to a straight line for very short edges", () => {
    expect(wavyPath(10, 10, 10.2, 10.1)).toBe("M 10 10 L 10.2 10.1");
    expect(coilPath(10, 10, 10.2, 10.1)).toBe("M 10 10 L 10.2 10.1");
  });
});

describe("visualForEdge", () => {
  it("fermion has arrow, no dash", () => {
    const v = visualForEdge(11, 0, 0, 100, 0);
    expect(v.showArrow).toBe(true);
    expect(v.strokeDasharray).toBeUndefined();
  });

  it("scalar (Higgs) is dashed, no arrow", () => {
    const v = visualForEdge(25, 0, 0, 100, 0);
    expect(v.showArrow).toBe(false);
    expect(v.strokeDasharray).toBeTruthy();
  });

  it("W and Z use a zigzag distinct from the photon's sinusoidal wave", () => {
    const w = visualForEdge(24, 0, 0, 100, 0);
    const z = visualForEdge(23, 0, 0, 100, 0);
    const gamma = visualForEdge(22, 0, 0, 100, 0);
    expect(w.stroke).not.toBe(gamma.stroke);
    expect(z.stroke).not.toBe(gamma.stroke);
    expect(w.stroke).not.toBe(z.stroke);  // Z is purple, W is red
    expect(w.strokeWidth).toBeGreaterThan(gamma.strokeWidth);
    // Zigzag path is distinguishable from photon's sinusoidal wave
    expect(w.path).not.toBe(gamma.path);
  });

  it("unknown PDG falls back to a plain straight line", () => {
    const v = visualForEdge(null, 0, 0, 100, 0);
    expect(v.path).toBe("M 0 0 L 100 0");
  });
});

describe("particle labels and palette helpers", () => {
  it("uses textbook symbols for common SM particles", () => {
    expect(particleLabel(22)).toBe("γ");
    expect(particleLabel(21)).toBe("g");
    expect(particleLabel(24)).toBe("W⁺");
    expect(particleLabel(11)).toBe("e⁻");
    expect(particleLabel(-11)).toBe("e⁺");
  });

  it("falls back to the particle name for unknown PDGs", () => {
    expect(particleLabel(999, "X")).toBe("X");
    expect(particleLabel(999)).toBe("999");
    expect(particleLabel(null)).toBe("?");
  });

  it("isGhostOrGoldstone marks ghost ranges", () => {
    for (const pdg of [82, 83, 9, 250, -251, 9000005]) {
      expect(isGhostOrGoldstone(pdg)).toBe(true);
    }
    for (const pdg of [22, 11, 25]) {
      expect(isGhostOrGoldstone(pdg)).toBe(false);
    }
  });

  it("paletteSortKey groups bosons before fermions, ghosts last", () => {
    expect(paletteSortKey(22)[0]).toBeLessThan(paletteSortKey(11)[0]);
    expect(paletteSortKey(25)[0]).toBeLessThan(paletteSortKey(11)[0]);
    expect(paletteSortKey(11)[0]).toBeLessThan(paletteSortKey(82)[0]);
  });
});

describe("spines", () => {
  it("straightSpine endpoints and tangent match the chord", () => {
    const s = straightSpine(0, 0, 100, 0);
    expect(s.length).toBeCloseTo(100, 6);
    const s0 = s.sample(0);
    const s1 = s.sample(1);
    const sm = s.sample(0.5);
    expect(s0.x).toBe(0);
    expect(s1.x).toBe(100);
    expect(sm.x).toBe(50);
    expect(sm.tx).toBeCloseTo(1, 6);
    expect(sm.ty).toBeCloseTo(0, 6);
  });

  it("circleSpine returns to its start point at t=1", () => {
    const s = circleSpine(0, 0, 10, 0);
    const s0 = s.sample(0);
    const s1 = s.sample(1);
    expect(s.length).toBeCloseTo(2 * Math.PI * 10, 6);
    expect(s1.x).toBeCloseTo(s0.x, 6);
    expect(s1.y).toBeCloseTo(s0.y, 6);
    // t=0.5 is on the opposite side of the circle from the start.
    const sm = s.sample(0.5);
    expect(sm.x).toBeCloseTo(-s0.x, 6);
    expect(sm.y).toBeCloseTo(-s0.y, 6);
  });

  it("quadraticSpine tangent at t=0.5 matches the chord direction", () => {
    // Bezier P0=(0,0) Pc=(50,40) P1=(100,0): symmetric, midpoint tangent
    // is the chord direction P1-P0 = (1, 0).
    const s = quadraticSpine(0, 0, 50, 40, 100, 0);
    const sm = s.sample(0.5);
    expect(sm.tx).toBeCloseTo(1, 4);
    expect(sm.ty).toBeCloseTo(0, 4);
    // Midpoint of the curve is at chord_mid + 0.5*offset = (50, 20).
    expect(sm.x).toBeCloseTo(50, 4);
    expect(sm.y).toBeCloseTo(20, 4);
  });

  it("wavyOnSpine of a circleSpine carries the wave around the loop", () => {
    const spine = circleSpine(0, 0, 22, 0);
    const d = wavyOnSpine(spine);
    // Must be a long polyline (many sample points around the loop).
    expect((d.match(/ L /g) ?? []).length).toBeGreaterThan(40);
    // First and last points come back to (nearly) the same place.
    const first = d.match(/^M (-?\d+\.\d+) (-?\d+\.\d+)/);
    const last = d.match(/L (-?\d+\.\d+) (-?\d+\.\d+)$/);
    expect(first).not.toBeNull();
    expect(last).not.toBeNull();
    if (first && last) {
      expect(Math.abs(Number(first[1]) - Number(last[1]))).toBeLessThan(1);
      expect(Math.abs(Number(first[2]) - Number(last[2]))).toBeLessThan(1);
    }
  });

  it("visualForSpine on a photon self-loop produces a non-trivial wavy path", () => {
    // Self-loop centered above a vertex at the origin.
    const spine = circleSpine(0, -22, 22, Math.PI / 2);
    const v = visualForSpine(22, spine);
    expect(v.stroke).toBe("#e07a00");
    expect((v.path.match(/ L /g) ?? []).length).toBeGreaterThan(40);
  });
});

describe("DiagramCanvas", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("renders the react-flow viewport", () => {
    render(<DiagramCanvas />);
    expect(document.querySelector(".react-flow")).toBeInTheDocument();
  });

  it("renders one node per store entry", () => {
    useDiagramStore.getState().addVertex({ id: "v1", position: [10, 10] });
    useDiagramStore.getState().addVertex({ id: "v2", position: [100, 10] });
    render(<DiagramCanvas />);
    expect(document.querySelectorAll(".react-flow__node").length).toBe(2);
  });

  it("renders external-leg nodes with their label", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addExternalLeg({ nodeId: "v1", kind: "incoming", label: "p1" });
    render(<DiagramCanvas />);
    const leg = document.querySelector(".react-flow__node-externalLeg");
    expect(leg).toBeTruthy();
    expect(leg?.textContent).toContain("p1");
  });
});

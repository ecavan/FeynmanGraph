import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Model } from "../api/types";
import { useDiagramStore } from "../state/diagram";
import { SelectionPanel } from "./SelectionPanel";

const STUB_MODEL: Model = {
  id: "stub",
  name: "Stub",
  particles: [
    {
      pdg_id: 22, name: "a", anti_name: "a", mass: "ZERO",
      charge: 0, lepton_number: 0, baryon_number: 0, spin: 2, color_rep: 1,
    },
    {
      pdg_id: 11, name: "e-", anti_name: "e+", mass: "Me",
      charge: -1, lepton_number: 1, baryon_number: 0, spin: 1, color_rep: 1,
    },
  ],
  vertices: [],
};

function setupTwoEdgeGraph() {
  const s = useDiagramStore.getState();
  s.reset();
  s.setCachedModel(STUB_MODEL);
  s.addVertex({ id: "v1", position: [0, 0] });
  s.addVertex({ id: "v2", position: [100, 0] });
  s.addVertex({ id: "v3", position: [0, 100] });
  s.addVertex({ id: "v4", position: [100, 100] });
  s.addEdge({ id: "e1", sourceNodeId: "v1", targetNodeId: "v2", particlePdgId: 22 });
  s.addEdge({ id: "e2", sourceNodeId: "v3", targetNodeId: "v4", particlePdgId: 11 });
}

describe("SelectionPanel — Cut control", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("shows a 'select partner' dropdown when the selected edge has no cut", () => {
    setupTwoEdgeGraph();
    useDiagramStore.getState().setSelection("e1", "edge");
    render(<SelectionPanel />);
    const sel = screen.getByTestId("cut-partner-select") as HTMLSelectElement;
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toContain("e2");
    expect(values).not.toContain("e1");
  });

  it("picking a partner labels both edges with the same cut", () => {
    setupTwoEdgeGraph();
    useDiagramStore.getState().setSelection("e1", "edge");
    render(<SelectionPanel />);
    fireEvent.change(screen.getByTestId("cut-partner-select"), {
      target: { value: "e2" },
    });
    const edges = useDiagramStore.getState().edges;
    expect(edges.find((e) => e.id === "e1")?.cutLabel).toBe("e1");
    expect(edges.find((e) => e.id === "e2")?.cutLabel).toBe("e1");
  });

  it("shows an Unlink button when the selected edge already has a cut", () => {
    setupTwoEdgeGraph();
    useDiagramStore.getState().setEdgeCutPair("e1", "e2");
    useDiagramStore.getState().setSelection("e1", "edge");
    render(<SelectionPanel />);
    expect(screen.getByTestId("cut-unlink")).toBeInTheDocument();
    expect(screen.getByText(/linked to e2/)).toBeInTheDocument();
  });

  it("Unlink clears the cut label on both edges", () => {
    setupTwoEdgeGraph();
    useDiagramStore.getState().setEdgeCutPair("e1", "e2");
    useDiagramStore.getState().setSelection("e1", "edge");
    render(<SelectionPanel />);
    fireEvent.click(screen.getByTestId("cut-unlink"));
    const edges = useDiagramStore.getState().edges;
    expect(edges.find((e) => e.id === "e1")?.cutLabel).toBeNull();
    expect(edges.find((e) => e.id === "e2")?.cutLabel).toBeNull();
  });

  it("excludes self-loop edges from the partner dropdown", () => {
    setupTwoEdgeGraph();
    const s = useDiagramStore.getState();
    s.addEdge({ id: "e3", sourceNodeId: "v1", targetNodeId: "v1", particlePdgId: 22 });
    s.setSelection("e1", "edge");
    render(<SelectionPanel />);
    const sel = screen.getByTestId("cut-partner-select") as HTMLSelectElement;
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).not.toContain("e3");
  });
});

describe("SelectionPanel — external node cut pairing", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  function setupForwardScattering() {
    const s = useDiagramStore.getState();
    s.reset();
    s.setCachedModel(STUB_MODEL);
    s.addVertex({ id: "ext1", position: [-100, 0] });
    s.addVertex({ id: "ext2", position: [100, 0] });
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addEdge({ id: "e1", sourceNodeId: "ext1", targetNodeId: "v1", particlePdgId: 11 });
    s.addEdge({ id: "e2", sourceNodeId: "v1", targetNodeId: "ext2", particlePdgId: 11 });
    s.addExternalLeg({ nodeId: "ext1", kind: "incoming", label: "p1" });
    s.addExternalLeg({ nodeId: "ext2", kind: "outgoing", label: "p2" });
  }

  it("shows a 'pair with external' dropdown when an unpaired external node is selected", () => {
    setupForwardScattering();
    useDiagramStore.getState().setSelection("ext1", "node");
    render(<SelectionPanel />);
    const sel = screen.getByTestId("external-cut-partner-select") as HTMLSelectElement;
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toContain("ext2");
    expect(values).not.toContain("ext1");
  });

  it("picking an external partner pairs the underlying incident edges", () => {
    setupForwardScattering();
    useDiagramStore.getState().setSelection("ext1", "node");
    render(<SelectionPanel />);
    fireEvent.change(screen.getByTestId("external-cut-partner-select"), {
      target: { value: "ext2" },
    });
    const edges = useDiagramStore.getState().edges;
    expect(edges.find((e) => e.id === "e1")?.cutLabel).toBe("e1");
    expect(edges.find((e) => e.id === "e2")?.cutLabel).toBe("e1");
  });

  it("shows the linked external + Unlink button when already paired", () => {
    setupForwardScattering();
    useDiagramStore.getState().setEdgeCutPair("e1", "e2");
    useDiagramStore.getState().setSelection("ext1", "node");
    render(<SelectionPanel />);
    expect(screen.getByTestId("external-cut-unlink")).toBeInTheDocument();
    expect(screen.getByText(/paired with ext2/)).toBeInTheDocument();
  });
});

describe("SelectionPanel — Details block", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("renders an edge details block with all expected rows", () => {
    setupTwoEdgeGraph();
    useDiagramStore.getState().setSelection("e1", "edge");
    render(<SelectionPanel />);
    const block = screen.getByTestId("selection-details");
    const text = block.textContent ?? "";
    expect(text).toContain("edge id");
    expect(text).toContain("e1");
    expect(text).toContain("particle");
    expect(text).toContain("PDG 22");
    expect(text).toContain("mass");
    expect(text).toContain("ZERO");
    expect(text).toContain("flow");
    expect(text).toContain("v1 → v2");
    expect(text).toContain("LMB chord");
    expect(text).toContain("cut label");
    expect(text).toContain("half-port IDs");
  });

  it("renders a node details block with vertex id, position, role, and incident edges", () => {
    setupTwoEdgeGraph();
    useDiagramStore.getState().setSelection("v1", "node");
    render(<SelectionPanel />);
    const block = screen.getByTestId("selection-details");
    const text = block.textContent ?? "";
    expect(text).toContain("vertex id");
    expect(text).toContain("v1");
    expect(text).toContain("position");
    expect(text).toContain("external role");
    expect(text).toContain("internal");
    expect(text).toContain("incident edges");
    expect(text).toContain("e1");
  });
});

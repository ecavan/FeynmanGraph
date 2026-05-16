import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { extractDeficits } from "./ConservationSidebar";
import { ExportPanel } from "./ExportPanel";
import { GeneratePanel } from "./GeneratePanel";
import { IssuesPanel } from "./IssuesPanel";
import { Toolbox } from "./Toolbox";

describe("Toolbox", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("generates sequential vertex IDs", () => {
    render(<Toolbox />);
    fireEvent.click(screen.getByTestId("add-vertex"));
    fireEvent.click(screen.getByTestId("add-vertex"));
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(useDiagramStore.getState().nodes.map((n) => n.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("fills the lowest free slot when a middle vertex was deleted", () => {
    render(<Toolbox />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId("add-vertex"));
    useDiagramStore.getState().removeVertex("v2");
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(useDiagramStore.getState().nodes.map((n) => n.id).sort()).toEqual(["v1", "v2", "v3"]);
  });

  it("disables + Add particle until 2 vertices exist", () => {
    render(<Toolbox />);
    expect(screen.getByTestId("add-particle")).toBeDisabled();
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(screen.getByTestId("add-particle")).toBeDisabled();
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(screen.getByTestId("add-particle")).not.toBeDisabled();
  });

  it("undo/redo buttons reflect history state", () => {
    render(<Toolbox />);
    expect(screen.getByTestId("undo")).toBeDisabled();
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(screen.getByTestId("undo")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("undo"));
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
  });
});

describe("ExportPanel", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("auto-exports on mount and shows the .dot text", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ dot: "digraph foo {}", warnings: [] }), { status: 200 }),
    );
    render(<ExportPanel />);
    await waitFor(() =>
      expect(screen.getByTestId("export-dot")).toHaveTextContent(/digraph foo/),
    );
  });

  it("renders warnings returned by the server", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        dot: "digraph bar {}",
        warnings: [
          "Theory 'qed' does not contain particle(s) PDG [21]; will fail.",
          "Theory 'qed' does not contain vertex/vertices ['V_113'].",
        ],
      }), { status: 200 }),
    );
    render(<ExportPanel />);
    await waitFor(() => expect(screen.getByTestId("export-warnings")).toBeInTheDocument());
    expect(screen.getByTestId("export-warnings")).toHaveTextContent(/Warnings \(2\)/);
  });

  it("shows the error callout when the API rejects", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "no legs", code: "NO_EXTERNAL_LEGS" }), { status: 422 }),
    );
    render(<ExportPanel />);
    await waitFor(() =>
      expect(screen.getByTestId("export-error")).toHaveTextContent(/NO_EXTERNAL_LEGS/),
    );
  });
});

describe("IssuesPanel", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("idle state has no issues", () => {
    render(<IssuesPanel />);
    expect(screen.getByText(/no issues/i)).toBeInTheDocument();
  });

  it("renders one row per returned issue", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        issues: [
          { code: "UNASSIGNED_EDGES", detail: "2 edges without particle", element_ids: [] },
          { code: "CONSERVATION_CHARGE", detail: "Charge: deficit = -1", element_ids: [] },
        ],
      }), { status: 200 }),
    );
    render(<IssuesPanel />);
    act(() => useDiagramStore.getState().setModelId("sm"));
    await waitFor(() => expect(screen.getByText(/UNASSIGNED_EDGES/)).toBeInTheDocument());
    expect(screen.getByText(/CONSERVATION_CHARGE/)).toBeInTheDocument();
  });

  it("re-validates when lmbEdgeIds changes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ issues: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        issues: [{ code: "INVALID_LMB_OVERRIDE", detail: "bogus", element_ids: ["bogus"] }],
      }), { status: 200 }));
    globalThis.fetch = fetchMock;
    render(<IssuesPanel />);
    act(() => useDiagramStore.getState().setModelId("sm"));
    await waitFor(() => expect(screen.getByText(/no issues/i)).toBeInTheDocument());
    act(() => useDiagramStore.getState().setLmbEdgeIds(["bogus"]));
    await waitFor(() => expect(screen.getByText(/INVALID_LMB_OVERRIDE/)).toBeInTheDocument());
  });
});

describe("extractDeficits", () => {
  it("parses deficits out of issue strings", () => {
    const d = extractDeficits([
      { code: "CONSERVATION_CHARGE", detail: "Charge: deficit = -1", element_ids: [] },
      { code: "CONSERVATION_LEPTON", detail: "Lepton: deficit = 2", element_ids: [] },
      { code: "CONSERVATION_BARYON", detail: "Baryon: deficit = 0", element_ids: [] },
      { code: "CONSERVATION_COLOR", detail: "Color: deficit = 1", element_ids: [] },
    ]);
    expect(d).toEqual({ charge: -1, lepton: 2, baryon: 0, color: 1 });
  });

  it("ignores non-conservation codes", () => {
    expect(extractDeficits([
      { code: "UNASSIGNED_EDGES", detail: "stuff", element_ids: [] },
    ])).toEqual({});
  });

  it("prefers the structured `deficit` field when present", () => {
    const d = extractDeficits([{
      code: "CONSERVATION_CHARGE",
      detail: "Charge: deficit = -1",
      element_ids: [],
      deficit: -2,
    }]);
    expect(d.charge).toBe(-2);
  });
});

describe("GeneratePanel", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("renders the form with defaults and a Generate button", () => {
    render(<GeneratePanel />);
    expect(screen.getByPlaceholderText("e+ e-")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("mu+ mu-")).toBeInTheDocument();
    expect(screen.getByTestId("generate-submit")).toBeInTheDocument();
  });

  it("renders the gallery and Load buttons when the API returns diagrams", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        count: 2, truncated: false,
        diagrams: [
          {
            process_name: "GL0", model_id: "sm", theory_id: "sm",
            nodes: [{ id: "v1", position: [0, 0], ufo_vertex_id: "V_98" }],
            edges: [], external_legs: [],
          },
          {
            process_name: "GL1", model_id: "sm", theory_id: "sm",
            nodes: [{ id: "v1", position: [0, 0], ufo_vertex_id: "V_99" }],
            edges: [], external_legs: [],
          },
        ],
      }), { status: 200 }),
    );
    render(<GeneratePanel />);
    fireEvent.click(screen.getByTestId("generate-submit"));
    await waitFor(() => expect(screen.getByText("GL0")).toBeInTheDocument());
    expect(screen.getByText("GL1")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^load$/i })).toHaveLength(2);
  });

  it("renders the helpful error message when the API rejects with a known code", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        detail: "Needs a custom projector for colored externals.",
        code: "GENERATE_NEEDS_PROJECTOR",
      }), { status: 422 }),
    );
    render(<GeneratePanel />);
    fireEvent.click(screen.getByTestId("generate-submit"));
    await waitFor(() =>
      expect(screen.getByText(/GENERATE_NEEDS_PROJECTOR/)).toBeInTheDocument(),
    );
  });

  it("clicking Load drops the spec into the diagram store", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        count: 1, truncated: false,
        diagrams: [{
          process_name: "GL0", model_id: "sm", theory_id: "sm",
          nodes: [
            { id: "ext0", position: [0, 0] },
            { id: "v1", position: [0, 0], ufo_vertex_id: "V_98" },
          ],
          edges: [{
            id: "e1", source_node_id: "ext0", target_node_id: "v1",
            particle_pdg_id: 11, direction: "source_to_target",
          }],
          external_legs: [{ node_id: "ext0", kind: "incoming", label: "p1" }],
        }],
      }), { status: 200 }),
    );
    render(<GeneratePanel />);
    fireEvent.click(screen.getByTestId("generate-submit"));
    await waitFor(() => expect(screen.getByText("GL0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^load$/i }));
    expect(useDiagramStore.getState().processName).toBe("GL0");
    expect(useDiagramStore.getState().nodes).toHaveLength(2);
  });
});

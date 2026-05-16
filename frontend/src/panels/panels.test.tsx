import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { extractDeficits } from "./ConservationSidebar";
import { ExportPanel } from "./ExportPanel";
import { IssuesPanel } from "./IssuesPanel";
import { ModelPicker } from "./ModelPicker";
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

describe("ModelPicker", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("lists models fetched from the API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify([
        { id: "sm", name: "Standard Model" },
        { id: "qed_min", name: "QED minimal" },
      ]), { status: 200 }),
    );
    render(<ModelPicker />);
    await waitFor(() => expect(screen.getByText("Standard Model")).toBeInTheDocument());
    expect(screen.getByText("QED minimal")).toBeInTheDocument();
  });

  it("shows an error message when the API fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 500 }));
    render(<ModelPicker />);
    await waitFor(() => {
      expect(document.querySelector("p[style*='red']")).toBeTruthy();
    });
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

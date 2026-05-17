import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { CanvasActions } from "./CanvasActions";

vi.mock("../api/client", () => ({
  ApiClient: class {
    listModels = vi.fn(async () => []);
    listTheories = vi.fn(async () => []);
    getModel = vi.fn(async () => ({ id: "sm", name: "SM", particles: [], vertices: [] }));
    validateGraph = vi.fn(async () => ({ issues: [], chord_edge_ids: [], loop_count: 0 }));
    exportDot = vi.fn(async () => ({ dot: "digraph x {}", warnings: [] }));
    generateAmp = vi.fn(async () => ({ diagrams: [], count: 0, truncated: false }));
    uploadUfo = vi.fn();
    exportDotBatch = vi.fn(async () => new Blob([""]));
  },
  ApiError: class extends Error {},
}));

describe("CanvasActions", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("renders all three trigger buttons", () => {
    render(<CanvasActions />);
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
  });

  it("clicking Generate opens its popover", () => {
    render(<CanvasActions />);
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(screen.getByTestId("generate-submit")).toBeInTheDocument();
  });

  it("clicking the active trigger toggles it off", () => {
    render(<CanvasActions />);
    const btn = screen.getByRole("button", { name: /generate/i });
    fireEvent.click(btn);
    expect(screen.getByTestId("generate-submit")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByTestId("generate-submit")).not.toBeInTheDocument();
  });

  it("clicking a different trigger swaps the popover", () => {
    render(<CanvasActions />);
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(screen.getByTestId("generate-submit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.queryByTestId("generate-submit")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("Escape closes the open popover", () => {
    render(<CanvasActions />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

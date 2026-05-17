import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExampleSpec } from "../api/types";
import { useDiagramStore } from "../state/diagram";
import { useGalleryStore } from "../state/gallery";
import { GalleryStrip } from "./GalleryStrip";

vi.mock("../api/client", () => ({
  ApiClient: class {
    exportDotBatch = vi.fn(async () => new Blob([""]));
  },
  ApiError: class extends Error {},
}));

function spec(name: string): ExampleSpec {
  return {
    model_id: "sm",
    theory_id: "qed",
    process_name: name,
    nodes: [{ id: "v1", position: [0, 0] }],
    edges: [],
    external_legs: [],
  };
}

describe("GalleryStrip", () => {
  beforeEach(() => {
    useGalleryStore.getState().clear();
    useDiagramStore.getState().reset();
  });

  it("renders nothing when the gallery is empty", () => {
    render(<GalleryStrip />);
    expect(screen.queryByTestId("gallery-strip")).not.toBeInTheDocument();
  });

  it("renders one cell per diagram when populated", () => {
    useGalleryStore.getState().setResult({
      diagrams: [spec("ee_mumu"), spec("ee_mumu_2")],
      count: 2,
      truncated: false,
      archiveName: "ee_to_mumu",
    });
    render(<GalleryStrip />);
    expect(screen.getByTestId("gallery-strip")).toBeInTheDocument();
    expect(screen.getByText("ee_mumu")).toBeInTheDocument();
    expect(screen.getByText("ee_mumu_2")).toBeInTheDocument();
  });

  it("clicking a cell loads it into the diagram store and sets loadedSpecId", () => {
    useGalleryStore.getState().setResult({
      diagrams: [spec("first"), spec("second")],
      count: 2,
      truncated: false,
      archiveName: "x",
    });
    render(<GalleryStrip />);
    fireEvent.click(screen.getByTestId("gallery-cell-second"));
    expect(useDiagramStore.getState().processName).toBe("second");
    expect(useGalleryStore.getState().loadedSpecId).toBe("second");
  });

  it("clear button empties the gallery", () => {
    useGalleryStore.getState().setResult({
      diagrams: [spec("a")],
      count: 1,
      truncated: false,
      archiveName: "x",
    });
    render(<GalleryStrip />);
    fireEvent.click(screen.getByTestId("gallery-clear"));
    expect(useGalleryStore.getState().diagrams).toEqual([]);
  });

  it("shows truncation hint when truncated", () => {
    useGalleryStore.getState().setResult({
      diagrams: [spec("a")],
      count: 50,
      truncated: true,
      archiveName: "x",
    });
    render(<GalleryStrip />);
    expect(screen.getByText(/49 more in \.zip/)).toBeInTheDocument();
  });
});

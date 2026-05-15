import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { Toolbox } from "./Toolbox";

describe("Toolbox", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("generates sequential vertex IDs (v1, v2, v3, …) when adding via the button", () => {
    render(<Toolbox />);
    fireEvent.click(screen.getByTestId("add-vertex"));
    fireEvent.click(screen.getByTestId("add-vertex"));
    fireEvent.click(screen.getByTestId("add-vertex"));
    const ids = useDiagramStore.getState().nodes.map((n) => n.id);
    expect(ids).toEqual(["v1", "v2", "v3"]);
  });

  it("fills the lowest free slot when a middle vertex was deleted", () => {
    render(<Toolbox />);
    fireEvent.click(screen.getByTestId("add-vertex"));
    fireEvent.click(screen.getByTestId("add-vertex"));
    fireEvent.click(screen.getByTestId("add-vertex"));
    // Delete v2; next add should reuse v2.
    useDiagramStore.getState().removeVertex("v2");
    fireEvent.click(screen.getByTestId("add-vertex"));
    const ids = useDiagramStore.getState().nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["v1", "v2", "v3"]);
  });

  it("disables + Add particle when there are fewer than 2 vertices", () => {
    render(<Toolbox />);
    expect(screen.getByTestId("add-particle")).toBeDisabled();
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(screen.getByTestId("add-particle")).toBeDisabled();
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(screen.getByTestId("add-particle")).not.toBeDisabled();
  });

  it("renders Undo + Redo buttons; both disabled at start, undo activates after a mutation", () => {
    render(<Toolbox />);
    expect(screen.getByTestId("undo")).toBeDisabled();
    expect(screen.getByTestId("redo")).toBeDisabled();
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(screen.getByTestId("undo")).not.toBeDisabled();
  });

  it("clicking Undo removes the most recently added vertex", () => {
    render(<Toolbox />);
    fireEvent.click(screen.getByTestId("add-vertex"));
    fireEvent.click(screen.getByTestId("add-vertex"));
    expect(useDiagramStore.getState().nodes).toHaveLength(2);
    fireEvent.click(screen.getByTestId("undo"));
    expect(useDiagramStore.getState().nodes).toHaveLength(1);
  });
});

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { DiagramCanvas } from "./DiagramCanvas";

describe("DiagramCanvas", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("renders the react-flow viewport when the store is empty", () => {
    render(<DiagramCanvas />);
    // react-flow attaches a wrapper class even when empty
    expect(document.querySelector(".react-flow")).toBeInTheDocument();
  });

  it("renders one node per store entry", () => {
    useDiagramStore.getState().addVertex({ id: "v1", position: [10, 10] });
    useDiagramStore.getState().addVertex({ id: "v2", position: [100, 10] });
    render(<DiagramCanvas />);
    expect(document.querySelectorAll(".react-flow__node").length).toBe(2);
  });

  it("renders external-leg nodes with their label in the DOM (hidden by default, shown on hover)", () => {
    const s = useDiagramStore.getState();
    s.addVertex({ id: "v1", position: [0, 0] });
    s.addExternalLeg({ nodeId: "v1", kind: "incoming", label: "p1" });
    render(<DiagramCanvas />);
    // The label is rendered but hidden via CSS opacity until hover/selection;
    // the node has a title attribute as the always-available accessible label.
    const legNode = document.querySelector(".react-flow__node-externalLeg");
    expect(legNode).toBeTruthy();
    expect(legNode?.querySelector("[title*='p1']")).toBeTruthy();
    expect(legNode?.textContent).toContain("p1");
  });
});

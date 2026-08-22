import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDiagramStore } from "../state/diagram";
import { NumeratorPanel } from "./NumeratorPanel";

beforeEach(() => {
  useDiagramStore.getState().reset();
  window.localStorage.clear();
});
afterEach(() => window.localStorage.clear());

describe("NumeratorPanel pop-out", () => {
  it("offers no pop-out control until there is a diagram", () => {
    render(<NumeratorPanel />);
    expect(screen.queryByTestId("numerator-popout")).toBeNull();
  });

  it("pops the numerator into a floating window and restores it", () => {
    useDiagramStore.getState().addVertex({ id: "v1", position: [0, 0] });
    render(<NumeratorPanel />);

    // Nothing floating yet; the pop-out control is available.
    expect(screen.queryByTestId("numerator-window")).toBeNull();
    const popout = screen.getByTestId("numerator-popout");

    // Pop out → floating window appears, an inline placeholder marks the move,
    // and the numerator controls now live inside the window.
    fireEvent.click(popout);
    expect(screen.getByTestId("numerator-window")).toBeTruthy();
    expect(screen.getByTestId("numerator-popped-placeholder")).toBeTruthy();
    expect(screen.getByTestId("numerator-load")).toBeTruthy();
    // the pop-out button is gone while it's already popped out
    expect(screen.queryByTestId("numerator-popout")).toBeNull();

    // Close the window → restored inline, pop-out control back.
    fireEvent.click(screen.getByTestId("numerator-window-close"));
    expect(screen.queryByTestId("numerator-window")).toBeNull();
    expect(screen.queryByTestId("numerator-popped-placeholder")).toBeNull();
    expect(screen.getByTestId("numerator-popout")).toBeTruthy();
  });
});

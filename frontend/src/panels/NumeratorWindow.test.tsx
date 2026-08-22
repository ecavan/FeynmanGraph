import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NumeratorWindow, loadWindowRect } from "./NumeratorWindow";

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("NumeratorWindow", () => {
  it("renders its title and its children in the body", () => {
    render(
      <NumeratorWindow title="Numerator" onClose={() => {}}>
        <span>the-numerator-content</span>
      </NumeratorWindow>,
    );
    expect(screen.getByText("Numerator")).toBeTruthy();
    expect(screen.getByText("the-numerator-content")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<NumeratorWindow title="Numerator" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("numerator-window-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores a persisted rect for its storageKey", () => {
    window.localStorage.setItem(
      "fg-window:num",
      JSON.stringify({ x: 120, y: 90, w: 500, h: 400 }),
    );
    render(
      <NumeratorWindow title="Numerator" storageKey="num" onClose={() => {}} />,
    );
    const win = screen.getByTestId("numerator-window");
    expect(win.style.left).toBe("120px");
    expect(win.style.top).toBe("90px");
    expect(win.style.width).toBe("500px");
    expect(win.style.height).toBe("400px");
  });

  it("dragging the title bar moves the window and persists the position", () => {
    render(
      <NumeratorWindow title="Numerator" storageKey="num" onClose={() => {}} />,
    );
    const win = screen.getByTestId("numerator-window");
    const bar = screen.getByTestId("numerator-window-titlebar");
    const startLeft = Number.parseInt(win.style.left, 10);
    const startTop = Number.parseInt(win.style.top, 10);

    fireEvent.mouseDown(bar, { clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 240 });
    fireEvent.mouseUp(window);

    expect(Number.parseInt(win.style.left, 10)).toBe(startLeft + 60);
    expect(Number.parseInt(win.style.top, 10)).toBe(startTop + 40);
    // persisted
    expect(loadWindowRect("num", { x: 0, y: 0, w: 0, h: 0 }).x).toBe(
      startLeft + 60,
    );
  });
});

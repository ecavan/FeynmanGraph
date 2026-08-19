import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ResizableBox, loadBoxHeight, saveBoxHeight } from "./ResizableBox";

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("ResizableBox", () => {
  it("renders its children", () => {
    render(
      <ResizableBox>
        <span>hello-content</span>
      </ResizableBox>,
    );
    expect(screen.getByText("hello-content")).toBeTruthy();
  });

  it("makes the content area user-resizable (drag handle + scroll)", () => {
    render(
      <ResizableBox>
        <span>x</span>
      </ResizableBox>,
    );
    const content = screen.getByTestId("resizable-content");
    // native vertical drag-resize handle + its own scroll for overflowing content
    expect(content.style.resize).toBe("vertical");
    expect(content.style.overflow).toBe("auto");
  });

  it("applies the initial height when nothing is stored", () => {
    render(
      <ResizableBox initialHeight={321}>
        <span>x</span>
      </ResizableBox>,
    );
    expect(screen.getByTestId("resizable-content").style.height).toBe("321px");
  });

  it("restores a persisted height for its storageKey", () => {
    saveBoxHeight("mybox", 555);
    render(
      <ResizableBox storageKey="mybox" initialHeight={200}>
        <span>x</span>
      </ResizableBox>,
    );
    expect(screen.getByTestId("resizable-content").style.height).toBe("555px");
  });

  it("expand toggle grows the box + persists, collapse restores it", () => {
    render(
      <ResizableBox storageKey="k" initialHeight={200} expandedHeight={640}>
        <span>x</span>
      </ResizableBox>,
    );
    const content = screen.getByTestId("resizable-content");
    const btn = screen.getByTestId("resizable-toggle");
    expect(content.style.height).toBe("200px");

    fireEvent.click(btn); // expand
    expect(content.style.height).toBe("640px");
    expect(loadBoxHeight("k", 0)).toBe(640);

    fireEvent.click(btn); // collapse
    expect(content.style.height).toBe("200px");
    expect(loadBoxHeight("k", 0)).toBe(200);
  });
});

describe("box height persistence helpers", () => {
  it("round-trips a height through localStorage", () => {
    expect(loadBoxHeight("z", 42)).toBe(42); // fallback when absent
    saveBoxHeight("z", 300);
    expect(loadBoxHeight("z", 42)).toBe(300);
  });

  it("ignores a missing storageKey and non-positive values", () => {
    saveBoxHeight(undefined, 300); // no-op, must not throw
    expect(loadBoxHeight(undefined, 99)).toBe(99);
    saveBoxHeight("q", -5); // invalid ignored
    expect(loadBoxHeight("q", 99)).toBe(99);
  });
});

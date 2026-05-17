import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Popover } from "./Popover";

function Harness(props: { initialOpen: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button">trigger</button>
      <Popover anchorRef={ref} open={props.initialOpen} onClose={() => {}}>
        <div data-testid="popover-content">hello</div>
      </Popover>
    </>
  );
}

describe("Popover", () => {
  it("renders nothing when closed", () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByTestId("popover-content")).not.toBeInTheDocument();
  });

  it("renders content when open", () => {
    render(<Harness initialOpen={true} />);
    expect(screen.getByTestId("popover-content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const handler = vi.fn();
    function H() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={ref} type="button">trigger</button>
          <Popover anchorRef={ref} open={true} onClose={handler}>
            <div>hi</div>
          </Popover>
        </>
      );
    }
    render(<H />);
    fireEvent.click(screen.getByTestId("popover-backdrop"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const handler = vi.fn();
    function H() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={ref} type="button">trigger</button>
          <Popover anchorRef={ref} open={true} onClose={handler}>
            <div>hi</div>
          </Popover>
        </>
      );
    }
    render(<H />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the panel", () => {
    const handler = vi.fn();
    function H() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={ref} type="button">trigger</button>
          <Popover anchorRef={ref} open={true} onClose={handler}>
            <div data-testid="inside">inner</div>
          </Popover>
        </>
      );
    }
    render(<H />);
    fireEvent.click(screen.getByTestId("inside"));
    expect(handler).not.toHaveBeenCalled();
  });
});

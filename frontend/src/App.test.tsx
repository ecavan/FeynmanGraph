import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("App routing", () => {
  it("shows the canvas view by default", () => {
    render(<App />);
    expect(screen.getByTestId("view-canvas")).toBeInTheDocument();
  });

  it("switches to the setup view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^setup$/i }));
    expect(screen.getByTestId("view-setup")).toBeInTheDocument();
  });

  it("switches to the import view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    expect(screen.getByTestId("view-import")).toBeInTheDocument();
  });

  it("switches to the export view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));
    expect(screen.getByTestId("view-export")).toBeInTheDocument();
  });

  it("aria-pressed reflects current view", () => {
    render(<App />);
    const canvasBtn = screen.getByRole("button", { name: /^canvas$/i });
    const setupBtn = screen.getByRole("button", { name: /^setup$/i });
    expect(canvasBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(setupBtn);
    expect(setupBtn).toHaveAttribute("aria-pressed", "true");
    expect(canvasBtn).toHaveAttribute("aria-pressed", "false");
  });
});

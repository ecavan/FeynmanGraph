import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("App routing", () => {
  it("shows the generate view by default", () => {
    render(<App />);
    expect(screen.getByTestId("view-generate")).toBeInTheDocument();
  });

  it("switches to the canvas view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^canvas$/i }));
    expect(screen.getByTestId("view-canvas")).toBeInTheDocument();
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
    const generateBtn = screen.getByRole("button", { name: /^generate$/i });
    const canvasBtn = screen.getByRole("button", { name: /^canvas$/i });
    expect(generateBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(canvasBtn);
    expect(canvasBtn).toHaveAttribute("aria-pressed", "true");
    expect(generateBtn).toHaveAttribute("aria-pressed", "false");
  });
});

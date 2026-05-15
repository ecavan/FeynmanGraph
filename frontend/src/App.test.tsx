import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("App routing", () => {
  it("shows the canvas view by default", () => {
    render(<App />);
    expect(screen.getByTestId("view-canvas")).toBeInTheDocument();
  });

  it("switches to the settings view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByTestId("view-settings")).toBeInTheDocument();
  });

  it("switches to the export view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByTestId("view-export")).toBeInTheDocument();
  });

  it("aria-pressed reflects current view", () => {
    render(<App />);
    const canvasBtn = screen.getByRole("button", { name: /canvas/i });
    const settingsBtn = screen.getByRole("button", { name: /settings/i });
    expect(canvasBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(settingsBtn);
    expect(settingsBtn).toHaveAttribute("aria-pressed", "true");
    expect(canvasBtn).toHaveAttribute("aria-pressed", "false");
  });
});

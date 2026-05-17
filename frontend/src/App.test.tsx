import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the canvas view", () => {
    render(<App />);
    expect(screen.getByTestId("view-canvas")).toBeInTheDocument();
  });

  it("renders the three top-right action triggers", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /^generate ▾$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^import ▾$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^export ▾$/i })).toBeInTheDocument();
  });

  it("no longer shows the old top tab bar", () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: /^canvas$/i })).not.toBeInTheDocument();
  });
});

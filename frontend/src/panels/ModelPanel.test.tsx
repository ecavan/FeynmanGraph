import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { ModelPanel } from "./ModelPanel";

describe("ModelPanel", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("lists models fetched from the API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: "sm", name: "Standard Model" },
          { id: "qed_min", name: "QED minimal" },
        ]),
        { status: 200 },
      ),
    );
    render(<ModelPanel />);
    await waitFor(() => expect(screen.getByText("Standard Model")).toBeInTheDocument());
    expect(screen.getByText("QED minimal")).toBeInTheDocument();
  });

  it("shows error message when the API fails", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));
    render(<ModelPanel />);
    await waitFor(() => {
      // ApiError message comes through; we just check something red shows
      const error = document.querySelector("p[style*='red']");
      expect(error).toBeTruthy();
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { ExportPanel } from "./ExportPanel";

describe("ExportPanel", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("auto-runs the export on mount and shows the .dot text", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ dot: "digraph foo { /*…*/ }", warnings: [] }),
        { status: 200 },
      ),
    );
    render(<ExportPanel />);
    await waitFor(() =>
      expect(screen.getByTestId("export-dot")).toHaveTextContent(/digraph foo/),
    );
  });

  it("renders warnings returned by the server", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          dot: "digraph bar {}",
          warnings: [
            "Theory 'qed' does not contain particle(s) PDG [21]; gammaloop import will likely fail.",
            "Theory 'qed' does not contain vertex/vertices ['V_113'].",
          ],
        }),
        { status: 200 },
      ),
    );
    render(<ExportPanel />);
    await waitFor(() =>
      expect(screen.getByTestId("export-warnings")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("export-warnings")).toHaveTextContent(/Warnings \(2\)/);
    expect(screen.getByTestId("export-warnings")).toHaveTextContent(/PDG \[21\]/);
  });

  it("shows the error callout when the API rejects the export", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "no legs", code: "NO_EXTERNAL_LEGS" }),
        { status: 422 },
      ),
    );
    render(<ExportPanel />);
    await waitFor(() =>
      expect(screen.getByTestId("export-error")).toHaveTextContent(/NO_EXTERNAL_LEGS/),
    );
  });
});

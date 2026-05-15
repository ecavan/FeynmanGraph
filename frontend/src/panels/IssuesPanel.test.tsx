import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramStore } from "../state/diagram";
import { IssuesPanel } from "./IssuesPanel";

describe("IssuesPanel", () => {
  beforeEach(() => useDiagramStore.getState().reset());

  it("shows 'no issues' when there is no model id (idle state)", () => {
    render(<IssuesPanel />);
    expect(screen.getByText(/no issues/i)).toBeInTheDocument();
  });

  it("renders one row per issue when the API returns issues", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          issues: [
            {
              code: "UNASSIGNED_EDGES",
              detail: "2 edges without particle",
              element_ids: ["e1", "e2"],
            },
            {
              code: "CONSERVATION_CHARGE",
              detail: "Charge does not conserve: deficit = -1",
              element_ids: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<IssuesPanel />);
    act(() => {
      useDiagramStore.getState().setModelId("sm");
    });
    await waitFor(() => expect(screen.getByText(/UNASSIGNED_EDGES/)).toBeInTheDocument());
    expect(screen.getByText(/CONSERVATION_CHARGE/)).toBeInTheDocument();
  });

  it("returns to 'no issues' if validate-graph returns empty", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ issues: [] }), { status: 200 }));
    render(<IssuesPanel />);
    act(() => {
      useDiagramStore.getState().setModelId("sm");
    });
    await waitFor(() => expect(screen.getByText(/no issues/i)).toBeInTheDocument());
  });
});

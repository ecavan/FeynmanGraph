import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetButton } from "./ResetButton";

afterEach(() => vi.restoreAllMocks());

describe("ResetButton", () => {
  it("posts to /api/reset and calls onReset when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok", removed: 1 }), {
        status: 200,
      }),
    );
    const onReset = vi.fn();
    render(<ResetButton onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reset"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does nothing when the user cancels the confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    globalThis.fetch = vi.fn();
    const onReset = vi.fn();
    render(<ResetButton onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });
});

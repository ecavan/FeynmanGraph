import { describe, expect, it, vi } from "vitest";
import { installStaleChunkReload } from "./reload-on-stale-chunk";

describe("installStaleChunkReload", () => {
  it("reloads when a lazy chunk fails to load (vite:preloadError)", () => {
    const reload = vi.fn();
    installStaleChunkReload(reload);
    window.dispatchEvent(new Event("vite:preloadError"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated events", () => {
    const reload = vi.fn();
    installStaleChunkReload(reload);
    window.dispatchEvent(new Event("resize"));
    expect(reload).not.toHaveBeenCalled();
  });
});

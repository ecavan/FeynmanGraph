import { beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "./diagram";
import { restoreFromLocalStorage, saveToLocalStorage, STORAGE_KEY } from "./persistence";

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    useDiagramStore.getState().reset();
  });

  it("roundtrips a diagram through localStorage", () => {
    const s = useDiagramStore.getState();
    s.setModelId("sm");
    s.addVertex({ id: "v1", position: [0, 0] });
    saveToLocalStorage();
    s.reset();
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
    const ok = restoreFromLocalStorage();
    expect(ok).toBe(true);
    expect(useDiagramStore.getState().modelId).toBe("sm");
    expect(useDiagramStore.getState().nodes).toHaveLength(1);
  });

  it("returns false on missing data", () => {
    expect(restoreFromLocalStorage()).toBe(false);
  });

  it("returns false on corrupt data", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(restoreFromLocalStorage()).toBe(false);
  });
});

import { useDiagramStore } from "./diagram";

export const STORAGE_KEY = "feyngraph:diagram:v2";
const LEGACY_STORAGE_KEYS = ["feyngraph:diagram:v1"];

export function saveToLocalStorage(): void {
  const { modelId, theoryId, processName, nodes, edges, externalLegs } =
    useDiagramStore.getState();
  const payload = { modelId, theoryId, processName, nodes, edges, externalLegs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function restoreFromLocalStorage(): boolean {
  // Drop any stale state from older persistence schemas so it can't be
  // accidentally read by a future migration or clutter the user's storage.
  for (const legacy of LEGACY_STORAGE_KEYS) {
    try { localStorage.removeItem(legacy); } catch {}
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    const s = useDiagramStore.getState();
    s.reset();
    s.setModelId(payload.modelId || "sm");
    s.setTheoryId(payload.theoryId ?? "qed");
    s.setProcessName(payload.processName ?? "process");
    for (const n of payload.nodes ?? []) s.addVertex(n);
    for (const e of payload.edges ?? []) s.addEdge(e);
    for (const l of payload.externalLegs ?? []) s.addExternalLeg(l);
    return true;
  } catch {
    return false;
  }
}

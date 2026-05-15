import { useDiagramStore } from "./diagram";

export const STORAGE_KEY = "feyngraph:diagram:v1";

export function saveToLocalStorage(): void {
  const { modelId, theoryId, processName, nodes, edges, externalLegs } =
    useDiagramStore.getState();
  const payload = { modelId, theoryId, processName, nodes, edges, externalLegs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function restoreFromLocalStorage(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    const s = useDiagramStore.getState();
    s.reset();
    s.setModelId(payload.modelId ?? "");
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

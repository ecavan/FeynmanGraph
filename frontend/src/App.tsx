import { useEffect } from "react";
import { ApiClient } from "./api/client";
import { useDiagramStore } from "./state/diagram";
import { restoreFromLocalStorage, saveToLocalStorage } from "./state/persistence";
import { CanvasView } from "./views/CanvasView";

const api = new ApiClient();

export default function App() {
  useEffect(() => {
    restoreFromLocalStorage();
  }, []);

  useEffect(() => {
    return useDiagramStore.subscribe(() => saveToLocalStorage());
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useDiagramStore.getState().redo();
        else useDiagramStore.getState().undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchModel = (modelId: string, theoryId: string) => {
      if (!modelId) {
        useDiagramStore.getState().setCachedModel(null);
        return;
      }
      api
        .getModel(modelId, theoryId)
        .then((m) => { if (!cancelled) useDiagramStore.getState().setCachedModel(m); })
        .catch(() => { if (!cancelled) useDiagramStore.getState().setCachedModel(null); });
    };
    const initial = useDiagramStore.getState();
    fetchModel(initial.modelId, initial.theoryId);
    let lastModelId = initial.modelId;
    let lastTheoryId = initial.theoryId;
    const unsubscribe = useDiagramStore.subscribe((s) => {
      if (s.modelId !== lastModelId || s.theoryId !== lastTheoryId) {
        lastModelId = s.modelId;
        lastTheoryId = s.theoryId;
        fetchModel(s.modelId, s.theoryId);
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  return (
    <div data-testid="app-root" style={{ height: "100vh" }}>
      <CanvasView />
    </div>
  );
}

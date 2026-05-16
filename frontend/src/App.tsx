import { useEffect, useState } from "react";
import { ApiClient } from "./api/client";
import { useDiagramStore } from "./state/diagram";
import { restoreFromLocalStorage, saveToLocalStorage } from "./state/persistence";
import { CanvasView } from "./views/CanvasView";
import { ExportView } from "./views/ExportView";
import { GenerateView } from "./views/GenerateView";
import { ImportView } from "./views/ImportView";

type View = "canvas" | "generate" | "import" | "export";

const api = new ApiClient();

export default function App() {
  const [view, setView] = useState<View>("generate");

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
    <div data-testid="app-root" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <nav style={{ display: "flex", gap: 8, padding: 8, borderBottom: "1px solid #ccc", alignItems: "center" }}>
        <TabButton label="Generate" active={view === "generate"} onClick={() => setView("generate")} />
        <TabButton label="Canvas" active={view === "canvas"} onClick={() => setView("canvas")} />
        <TabButton label="Import" active={view === "import"} onClick={() => setView("import")} />
        <TabButton label="Export" active={view === "export"} onClick={() => setView("export")} />
      </nav>
      <main style={{ flex: 1, overflow: "auto" }}>
        {view === "generate" && <GenerateView onLoad={() => setView("canvas")} />}
        {view === "canvas" && <CanvasView />}
        {view === "import" && <ImportView />}
        {view === "export" && <ExportView />}
      </main>
    </div>
  );
}

function TabButton(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      style={{
        padding: "6px 14px",
        background: props.active ? "#0066ff" : "white",
        color: props.active ? "white" : "#222",
        border: "1px solid",
        borderColor: props.active ? "#0066ff" : "#999",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {props.label}
    </button>
  );
}

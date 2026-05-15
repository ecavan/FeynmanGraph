import { useEffect, useState } from "react";
import { ApiClient } from "./api/client";
import { loadExampleIntoStore } from "./panels/ExampleLoader";
import { useDiagramStore } from "./state/diagram";
import { restoreFromLocalStorage, saveToLocalStorage } from "./state/persistence";
import { CanvasView } from "./views/CanvasView";
import { ExportView } from "./views/ExportView";
import { ImportView } from "./views/ImportView";
import { SetupView } from "./views/SetupView";

type View = "canvas" | "setup" | "import" | "export";

const api = new ApiClient();

export default function App() {
  const [view, setView] = useState<View>("canvas");

  // On mount: restore prior session from localStorage, or fall back to ee_mumu starter.
  useEffect(() => {
    if (restoreFromLocalStorage()) return;
    api
      .getExample("ee_mumu")
      .then((spec) => loadExampleIntoStore(spec))
      .catch(() => {
        /* leave canvas empty */
      });
  }, []);

  // Persist on every store change.
  useEffect(() => {
    const unsubscribe = useDiagramStore.subscribe(() => {
      saveToLocalStorage();
    });
    return unsubscribe;
  }, []);

  // Keep the cached Model in sync with whichever (modelId, theoryId) pair is
  // currently picked. The cached model is the THEORY-FILTERED particle list
  // so downstream panels (Toolbox palette, SelectionPanel picker) only see
  // particles relevant to the active theory.
  useEffect(() => {
    let cancelled = false;
    const fetchOnChange = (modelId: string, theoryId: string) => {
      if (!modelId) {
        useDiagramStore.getState().setCachedModel(null);
        return;
      }
      api
        .getModel(modelId, theoryId)
        .then((m) => {
          if (!cancelled) useDiagramStore.getState().setCachedModel(m);
        })
        .catch(() => {
          if (!cancelled) useDiagramStore.getState().setCachedModel(null);
        });
    };
    const initial = useDiagramStore.getState();
    fetchOnChange(initial.modelId, initial.theoryId);
    let lastModelId = initial.modelId;
    let lastTheoryId = initial.theoryId;
    const unsubscribe = useDiagramStore.subscribe((s) => {
      if (s.modelId !== lastModelId || s.theoryId !== lastTheoryId) {
        lastModelId = s.modelId;
        lastTheoryId = s.theoryId;
        fetchOnChange(s.modelId, s.theoryId);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return (
    <div
      data-testid="app-root"
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <nav
        style={{
          display: "flex",
          gap: 8,
          padding: 8,
          borderBottom: "1px solid #ccc",
        }}
      >
        <TabButton label="Canvas" active={view === "canvas"} onClick={() => setView("canvas")} />
        <TabButton label="Setup" active={view === "setup"} onClick={() => setView("setup")} />
        <TabButton label="Import" active={view === "import"} onClick={() => setView("import")} />
        <TabButton label="Export" active={view === "export"} onClick={() => setView("export")} />
      </nav>
      <main style={{ flex: 1, overflow: "auto" }}>
        {view === "canvas" && <CanvasView />}
        {view === "setup" && <SetupView />}
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

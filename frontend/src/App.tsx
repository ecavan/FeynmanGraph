import { useEffect, useState } from "react";
import { ApiClient } from "./api/client";
import { loadExampleIntoStore } from "./panels/ExampleLoader";
import { useDiagramStore } from "./state/diagram";
import { restoreFromLocalStorage, saveToLocalStorage } from "./state/persistence";
import { CanvasView } from "./views/CanvasView";
import { ExportView } from "./views/ExportView";
import { SettingsView } from "./views/SettingsView";

type View = "canvas" | "settings" | "export";

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
        <button onClick={() => setView("canvas")} aria-pressed={view === "canvas"}>
          Canvas
        </button>
        <button onClick={() => setView("settings")} aria-pressed={view === "settings"}>
          Settings
        </button>
        <button onClick={() => setView("export")} aria-pressed={view === "export"}>
          Export
        </button>
      </nav>
      <main style={{ flex: 1, overflow: "auto" }}>
        {view === "canvas" && <CanvasView />}
        {view === "settings" && <SettingsView />}
        {view === "export" && <ExportView />}
      </main>
    </div>
  );
}

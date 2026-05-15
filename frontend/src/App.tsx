import { useState } from "react";
import { CanvasView } from "./views/CanvasView";
import { ExportView } from "./views/ExportView";
import { SettingsView } from "./views/SettingsView";

type View = "canvas" | "settings" | "export";

export default function App() {
  const [view, setView] = useState<View>("canvas");
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

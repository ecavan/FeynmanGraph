import { DiagramPreview } from "../canvas/DiagramPreview";
import { ExportPanel } from "../panels/ExportPanel";
import { useDiagramStore } from "../state/diagram";

export function ExportView() {
  const processName = useDiagramStore((s) => s.processName);
  return (
    <div data-testid="view-export" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <header>
        <h3 style={{ margin: "0 0 4px 0" }}>Export</h3>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
          Preview below, then download as <code>{processName}.dot</code> for
          gammaloop's <code>import graphs</code>.
        </p>
      </header>
      <DiagramPreview />
      <ExportPanel />
    </div>
  );
}

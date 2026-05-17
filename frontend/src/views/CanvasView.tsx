import { DiagramCanvas } from "../canvas/DiagramCanvas";
import { CanvasActions } from "../panels/CanvasActions";
import { ConservationSidebar } from "../panels/ConservationSidebar";
import { GalleryStrip } from "../panels/GalleryStrip";
import { IssuesPanel } from "../panels/IssuesPanel";
import { LoopRoutingPanel } from "../panels/LoopRoutingPanel";
import { SelectionPanel } from "../panels/SelectionPanel";
import { Toolbox } from "../panels/Toolbox";

export function CanvasView() {
  return (
    <div
      data-testid="view-canvas"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 320px", flex: 1, minHeight: 0 }}>
        <aside style={{ borderRight: "1px solid #ccc", padding: 12, overflow: "auto" }}>
          <Toolbox />
        </aside>
        <div style={{ position: "relative", minHeight: 0 }}>
          <DiagramCanvas />
          <CanvasActions />
        </div>
        <aside
          style={{
            borderLeft: "1px solid #ccc",
            padding: 12,
            overflow: "auto",
          }}
        >
          <SelectionPanel />
          <hr />
          <ConservationSidebar />
          <hr />
          <IssuesPanel />
          <hr />
          <LoopRoutingPanel />
        </aside>
      </div>
      <GalleryStrip />
    </div>
  );
}

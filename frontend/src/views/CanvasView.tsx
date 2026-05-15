import { DiagramCanvas } from "../canvas/DiagramCanvas";
import { ConservationSidebar } from "../panels/ConservationSidebar";
import { IssuesPanel } from "../panels/IssuesPanel";
import { LoopRoutingPanel } from "../panels/LoopRoutingPanel";

export function CanvasView() {
  return (
    <div
      data-testid="view-canvas"
      style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "100%" }}
    >
      <DiagramCanvas />
      <aside
        style={{
          borderLeft: "1px solid #ccc",
          padding: 12,
          overflow: "auto",
        }}
      >
        <ConservationSidebar />
        <hr />
        <IssuesPanel />
        <hr />
        <LoopRoutingPanel />
      </aside>
    </div>
  );
}

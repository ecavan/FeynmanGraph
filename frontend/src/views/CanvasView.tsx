import { DiagramCanvas } from "../canvas/DiagramCanvas";
import { ConservationSidebar } from "../panels/ConservationSidebar";
import { IssuesPanel } from "../panels/IssuesPanel";
import { LoopRoutingPanel } from "../panels/LoopRoutingPanel";
import { SelectionPanel } from "../panels/SelectionPanel";
import { Toolbox } from "../panels/Toolbox";

export function CanvasView() {
  return (
    <div
      data-testid="view-canvas"
      style={{ display: "grid", gridTemplateColumns: "220px 1fr 320px", height: "100%" }}
    >
      <aside style={{ borderRight: "1px solid #ccc", padding: 12, overflow: "auto" }}>
        <Toolbox />
      </aside>
      <DiagramCanvas />
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
  );
}

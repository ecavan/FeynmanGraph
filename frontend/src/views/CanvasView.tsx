import { DiagramCanvas } from "../canvas/DiagramCanvas";

export function CanvasView() {
  return (
    <div data-testid="view-canvas" style={{ height: "100%" }}>
      <DiagramCanvas />
    </div>
  );
}

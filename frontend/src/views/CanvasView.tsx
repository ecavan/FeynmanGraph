import { type CSSProperties, useState } from "react";
import { DiagramCanvas } from "../canvas/DiagramCanvas";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { CanvasActions } from "../panels/CanvasActions";
import { ConservationSidebar } from "../panels/ConservationSidebar";
import { GalleryStrip } from "../panels/GalleryStrip";
import { IssuesPanel } from "../panels/IssuesPanel";
import { LoopRoutingPanel } from "../panels/LoopRoutingPanel";
import { NumeratorPanel } from "../panels/NumeratorPanel";
import { SelectionPanel } from "../panels/SelectionPanel";
import { Toolbox } from "../panels/Toolbox";

const NARROW = "(max-width: 900px)";

function DetailsPanels() {
  return (
    <>
      <SelectionPanel />
      <hr />
      <ConservationSidebar />
      <hr />
      <IssuesPanel />
      <hr />
      <LoopRoutingPanel />
    </>
  );
}

const drawerBase: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 300,
  maxWidth: "85%",
  background: "white",
  padding: 12,
  overflow: "auto",
  zIndex: 20,
  boxShadow: "0 0 16px rgba(0,0,0,0.2)",
};

const toggleBase: CSSProperties = {
  position: "absolute",
  zIndex: 6,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 500,
  background: "white",
  border: "1px solid #bbb",
  borderRadius: 4,
  cursor: "pointer",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
};

export function CanvasView() {
  const narrow = useMediaQuery(NARROW);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function closeDrawers() {
    setToolsOpen(false);
    setDetailsOpen(false);
  }

  return (
    <div
      data-testid="view-canvas"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "1fr" : "220px 1fr 320px",
          flex: 1,
          minHeight: 0,
          position: "relative",
        }}
      >
        {!narrow && (
          <aside
            style={{
              borderRight: "1px solid #ccc",
              padding: 12,
              overflow: "auto",
            }}
          >
            <Toolbox />
          </aside>
        )}

        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
            <DiagramCanvas />
            <CanvasActions />
            {narrow && (
              <>
                <button
                  type="button"
                  data-testid="toggle-tools"
                  onClick={() => setToolsOpen(true)}
                  style={{ ...toggleBase, top: 8, left: 8 }}
                >
                  ☰ Tools
                </button>
                <button
                  type="button"
                  data-testid="toggle-details"
                  onClick={() => setDetailsOpen(true)}
                  style={{ ...toggleBase, top: 44, left: 8 }}
                >
                  Details
                </button>
              </>
            )}
          </div>
          <div
            style={{
              borderTop: "1px solid #ccc",
              background: "#fafafa",
              padding: 12,
              maxHeight: "38vh",
              overflow: "auto",
              flexShrink: 0,
            }}
          >
            <NumeratorPanel />
          </div>
        </div>

        {!narrow && (
          <aside
            style={{
              borderLeft: "1px solid #ccc",
              padding: 12,
              overflow: "auto",
            }}
          >
            <DetailsPanels />
          </aside>
        )}

        {narrow && (toolsOpen || detailsOpen) && (
          <button
            type="button"
            aria-label="Close panel"
            onClick={closeDrawers}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 15,
              background: "rgba(0,0,0,0.25)",
              border: "none",
              cursor: "pointer",
            }}
          />
        )}
        {narrow && toolsOpen && (
          <aside
            data-testid="tools-drawer"
            style={{ ...drawerBase, left: 0, borderRight: "1px solid #ccc" }}
          >
            <Toolbox />
          </aside>
        )}
        {narrow && detailsOpen && (
          <aside
            data-testid="details-drawer"
            style={{ ...drawerBase, right: 0, borderLeft: "1px solid #ccc" }}
          >
            <DetailsPanels />
          </aside>
        )}
      </div>
      <GalleryStrip />
    </div>
  );
}

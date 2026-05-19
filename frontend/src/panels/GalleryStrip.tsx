import { ApiClient, ApiError } from "../api/client";
import { loadGraphIntoStore } from "../state/loadGraph";
import { useGalleryStore } from "../state/gallery";
import { DiagramThumbnail } from "./GeneratePanel";

const api = new ApiClient();

export function GalleryStrip() {
  const diagrams = useGalleryStore((s) => s.diagrams);
  const count = useGalleryStore((s) => s.count);
  const truncated = useGalleryStore((s) => s.truncated);
  const archiveName = useGalleryStore((s) => s.archiveName);
  const loadedSpecId = useGalleryStore((s) => s.loadedSpecId);
  const setLoaded = useGalleryStore((s) => s.setLoaded);
  const clear = useGalleryStore((s) => s.clear);

  if (diagrams.length === 0) return null;

  const remaining = Math.max(0, count - diagrams.length);

  async function exportAll() {
    try {
      const blob = await api.exportDotBatch(diagrams, archiveName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${archiveName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : String(e);
      alert(`Export failed: ${msg}`);
    }
  }

  return (
    <div
      data-testid="gallery-strip"
      style={{
        maxHeight: 330,
        borderTop: "1px solid #ddd",
        background: "#fafafa",
        display: "flex",
        alignItems: "stretch",
        padding: "6px 10px",
        gap: 10,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          overflowY: "auto",
          alignItems: "flex-start",
        }}
      >
        {diagrams.map((spec) => {
          const active = spec.process_name === loadedSpecId;
          return (
            <button
              key={spec.process_name}
              type="button"
              data-testid={`gallery-cell-${spec.process_name}`}
              onClick={() => {
                loadGraphIntoStore(spec);
                setLoaded(spec.process_name);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: 4,
                border: active ? "2px solid #0066ff" : "1px solid #ddd",
                borderRadius: 4,
                background: "white",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <DiagramThumbnail spec={spec} />
              <span style={{ fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {active ? "★ " : ""}
                {spec.process_name}
              </span>
            </button>
          );
        })}
        {truncated && remaining > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 10px",
              fontSize: 11,
              opacity: 0.6,
              whiteSpace: "nowrap",
            }}
          >
            ({remaining} more in .zip)
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
        <button
          type="button"
          onClick={exportAll}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            background: "white",
            color: "#0066ff",
            border: "1px solid #0066ff",
            borderRadius: 4,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ⬇ Export all
        </button>
        <button
          type="button"
          data-testid="gallery-clear"
          onClick={clear}
          title="Clear gallery"
          style={{
            padding: "2px 8px",
            fontSize: 11,
            background: "white",
            color: "#666",
            border: "1px solid #ccc",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          × Clear
        </button>
      </div>
    </div>
  );
}

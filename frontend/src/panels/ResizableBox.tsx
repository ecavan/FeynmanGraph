import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

// A display container the user can make as big as they need: a native vertical
// drag-resize handle (grab the bottom edge), a one-click Expand/Collapse toggle,
// and it remembers the size you set (per storageKey) across reloads. Built for
// the reduction / numerator output, which can run to hundreds of KB and never
// fit a fixed-height box.

const KEY_PREFIX = "fg-box-h:";

/** Read a remembered box height (px) for a storageKey, or `fallback`. */
export function loadBoxHeight(
  storageKey: string | undefined,
  fallback: number,
): number {
  if (!storageKey) return fallback;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + storageKey);
    const n = raw == null ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/** Persist a box height (px) for a storageKey. No-op for a missing key or a
 *  non-positive value; never throws (localStorage may be unavailable/full). */
export function saveBoxHeight(
  storageKey: string | undefined,
  px: number,
): void {
  if (!storageKey || !Number.isFinite(px) || px <= 0) return;
  try {
    window.localStorage.setItem(
      KEY_PREFIX + storageKey,
      String(Math.round(px)),
    );
  } catch {
    /* ignore */
  }
}

export function ResizableBox({
  children,
  storageKey,
  initialHeight = 320,
  minHeight = 120,
  expandedHeight = 640,
}: {
  children: ReactNode;
  storageKey?: string;
  initialHeight?: number;
  minHeight?: number;
  expandedHeight?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Height is owned imperatively (via the DOM node), NOT the style prop: the
  // browser's native CSS `resize` writes directly to element.style.height, and
  // a React re-render must not clobber that. So we set the height on the node in
  // a layout effect (from the remembered/initial value) and leave it out of the
  // JSX style object entirely.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = loadBoxHeight(storageKey, initialHeight);
    el.style.height = `${h}px`;
    setExpanded(h >= expandedHeight);

    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      const cur = el.offsetHeight;
      if (cur > 0) {
        saveBoxHeight(storageKey, cur);
        setExpanded(cur >= expandedHeight);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [storageKey, initialHeight, expandedHeight]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    const next = expanded ? initialHeight : expandedHeight;
    el.style.height = `${next}px`;
    saveBoxHeight(storageKey, next);
    setExpanded(!expanded);
  }

  return (
    <div data-testid="resizable-box">
      <div
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}
      >
        <button
          type="button"
          data-testid="resizable-toggle"
          onClick={toggle}
          title={expanded ? "Collapse" : "Expand"}
          style={{
            padding: "2px 8px",
            fontSize: 11,
            background: "white",
            border: "1px solid #ccc",
            borderRadius: 3,
            cursor: "pointer",
            opacity: 0.75,
          }}
        >
          {expanded ? "▲ Collapse" : "⤢ Expand"}
        </button>
      </div>
      <div
        ref={ref}
        data-testid="resizable-content"
        style={{
          resize: "vertical",
          overflow: "auto",
          minHeight,
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          background: "white",
        }}
      >
        {children}
      </div>
    </div>
  );
}

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// A floating, draggable, resizable window that hosts the numerator content so a
// large one-loop formula has room to breathe. It does NOT dim the app — you can
// move it aside and keep editing the diagram behind it. The numerator/reduce
// state lives in the parent panel, so popping out only re-renders the display,
// not the data (a reduction you just ran stays). Position + size are remembered
// per `storageKey`.

export type WindowRect = { x: number; y: number; w: number; h: number };

const KEY_PREFIX = "fg-window:";
const DEFAULT_RECT: WindowRect = { x: 96, y: 96, w: 680, h: 500 };

/** Keep the window's title bar on-screen so a persisted off-screen position (from
 *  dragging it away) can't strand it on the next open. */
export function clampRect(rect: WindowRect): WindowRect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, 0), Math.max(0, vw - 80)),
    y: Math.min(Math.max(rect.y, 0), Math.max(0, vh - 40)),
  };
}

/** Read a remembered window rect for a storageKey, or `fallback`. Never throws. */
export function loadWindowRect(
  storageKey: string | undefined,
  fallback: WindowRect,
): WindowRect {
  if (!storageKey) return fallback;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + storageKey);
    if (!raw) return fallback;
    const r = JSON.parse(raw) as Partial<WindowRect>;
    if (
      typeof r.x === "number" &&
      typeof r.y === "number" &&
      typeof r.w === "number" &&
      typeof r.h === "number" &&
      r.w > 0 &&
      r.h > 0
    ) {
      return { x: r.x, y: r.y, w: r.w, h: r.h };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/** Persist a window rect for a storageKey. No-op without a key; never throws. */
export function saveWindowRect(
  storageKey: string | undefined,
  rect: WindowRect,
): void {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(
      KEY_PREFIX + storageKey,
      JSON.stringify({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.w),
        h: Math.round(rect.h),
      }),
    );
  } catch {
    /* localStorage may be unavailable/full */
  }
}

export function NumeratorWindow({
  title = "Numerator",
  storageKey,
  onClose,
  children,
}: {
  title?: string;
  storageKey?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [rect, setRect] = useState<WindowRect>(() =>
    clampRect(loadWindowRect(storageKey, DEFAULT_RECT)),
  );
  const outerRef = useRef<HTMLDivElement | null>(null);
  // Latest rect, so the drag-end handler (attached once) can persist it.
  const rectRef = useRef(rect);
  rectRef.current = rect;
  // Drag origin, set on title-bar mousedown; null while not dragging.
  const drag = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Stable window-level drag listeners (attached once): they read the drag ref,
  // so re-renders during a drag don't detach/re-attach anything.
  useEffect(() => {
    function move(e: MouseEvent) {
      const d = drag.current;
      if (!d) return;
      setRect((r) => ({
        ...r,
        x: d.origX + (e.clientX - d.startX),
        y: d.origY + (e.clientY - d.startY),
      }));
    }
    function up() {
      if (!drag.current) return;
      drag.current = null;
      saveWindowRect(storageKey, rectRef.current);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [storageKey]);

  // Persist size when the user drags the native resize corner.
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w <= 0 || h <= 0) return;
      setRect((r) => {
        if (r.w === w && r.h === h) return r;
        const next = { ...r, w, h };
        saveWindowRect(storageKey, next);
        return next;
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [storageKey]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onTitleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.x,
      origY: rect.y,
    };
  }

  return (
    <div
      ref={outerRef}
      data-testid="numerator-window"
      style={{
        position: "fixed",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        minWidth: 320,
        minHeight: 200,
        zIndex: 2000,
        background: "white",
        border: "1px solid #bbb",
        borderRadius: 6,
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        resize: "both",
        overflow: "hidden",
      }}
    >
      <div
        data-testid="numerator-window-titlebar"
        onMouseDown={onTitleMouseDown}
        style={{
          cursor: "move",
          padding: "6px 10px",
          background: "#f0f0f0",
          borderBottom: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          userSelect: "none",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        <button
          type="button"
          data-testid="numerator-window-close"
          onClick={onClose}
          title="Close (Esc)"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>
      <div
        data-testid="numerator-window-body"
        style={{
          flex: 1,
          overflow: "auto",
          padding: "10px 12px",
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

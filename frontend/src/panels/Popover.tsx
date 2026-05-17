import { useEffect, useState, type ReactNode, type RefObject } from "react";

type Props = {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
};

type AnchorRect = { top: number; right: number };

function readAnchor(ref: RefObject<HTMLElement>): AnchorRect | null {
  const el = ref.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.bottom + 6, right: window.innerWidth - r.right };
}

export function Popover(props: Props) {
  const [pos, setPos] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setPos(readAnchor(props.anchorRef));
    function onResize() {
      setPos(readAnchor(props.anchorRef));
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [props.open, props.anchorRef, props.onClose]);

  if (!props.open || !pos) return null;

  return (
    <>
      <div
        data-testid="popover-backdrop"
        onClick={props.onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "transparent",
          zIndex: 9999,
        }}
      />
      <div
        role="dialog"
        style={{
          position: "fixed",
          top: pos.top,
          right: pos.right,
          width: props.width ?? 320,
          maxHeight: "70vh",
          overflow: "auto",
          background: "white",
          border: "1px solid #ccc",
          borderRadius: 6,
          boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
          zIndex: 10000,
          padding: 12,
        }}
      >
        {props.children}
      </div>
    </>
  );
}

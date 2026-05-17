import { forwardRef, useRef, useState } from "react";
import { ExportPanel } from "./ExportPanel";
import { GeneratePanel } from "./GeneratePanel";
import { Popover } from "./Popover";
import { UfoUploader } from "./UfoUploader";

type OpenKind = "generate" | "import" | "export" | null;

export function CanvasActions() {
  const [open, setOpen] = useState<OpenKind>(null);
  const [exportTick, setExportTick] = useState(0);
  const genRef = useRef<HTMLButtonElement>(null);
  const impRef = useRef<HTMLButtonElement>(null);
  const expRef = useRef<HTMLButtonElement>(null);

  function toggle(kind: Exclude<OpenKind, null>) {
    setOpen((prev) => {
      if (prev === kind) return null;
      if (kind === "export") setExportTick((t) => t + 1);
      return kind;
    });
  }

  function close() {
    setOpen(null);
  }

  function handleImportSuccess() {
    setTimeout(() => setOpen((cur) => (cur === "import" ? null : cur)), 1000);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        display: "flex",
        gap: 6,
        zIndex: 5,
      }}
    >
      <ActionButton ref={genRef} label="Generate ▾" active={open === "generate"} onClick={() => toggle("generate")} />
      <ActionButton ref={impRef} label="Import ▾" active={open === "import"} onClick={() => toggle("import")} />
      <ActionButton ref={expRef} label="Export ▾" active={open === "export"} onClick={() => toggle("export")} />

      <Popover anchorRef={genRef} open={open === "generate"} onClose={close} width={340}>
        <GeneratePanel onSuccess={close} />
      </Popover>
      <Popover anchorRef={impRef} open={open === "import"} onClose={close} width={340}>
        <UfoUploader onUploaded={handleImportSuccess} />
      </Popover>
      <Popover anchorRef={expRef} open={open === "export"} onClose={close} width={520}>
        <ExportPanel openTick={exportTick} />
      </Popover>
    </div>
  );
}

const ActionButton = forwardRef<HTMLButtonElement, {
  label: string;
  active: boolean;
  onClick: () => void;
}>(function ActionButton(props, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      style={{
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 500,
        background: props.active ? "#0066ff" : "white",
        color: props.active ? "white" : "#222",
        border: "1px solid",
        borderColor: props.active ? "#0066ff" : "#bbb",
        borderRadius: 4,
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      {props.label}
    </button>
  );
});

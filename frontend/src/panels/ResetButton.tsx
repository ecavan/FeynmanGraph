import { useState } from "react";
import { ApiClient } from "../api/client";

const api = new ApiClient();

export function ResetButton({ onReset }: { onReset?: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (
      !window.confirm(
        "Reset the server? This clears all uploaded models and server-side state for everyone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.reset();
      onReset?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="Clear all uploaded models and server-side state"
    >
      {busy ? "Resetting…" : "Reset"}
    </button>
  );
}

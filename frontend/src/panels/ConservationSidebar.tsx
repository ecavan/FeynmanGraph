import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { GraphIssue } from "../api/types";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

type Deficits = {
  charge?: number;
  lepton?: number;
  baryon?: number;
  color?: number;
};

export function ConservationSidebar() {
  const [deficits, setDeficits] = useState<Deficits>({});
  const state = useDiagramStore();

  useEffect(() => {
    if (!state.modelId) {
      setDeficits({});
      return;
    }
    const spec = serializeGraphSpec(state);
    api
      .validateGraph(spec)
      .then((resp) => setDeficits(extractDeficits(resp.issues)))
      .catch(() => setDeficits({}));
  }, [state.modelId, state.theoryId, state.nodes, state.edges, state.externalLegs]);

  return (
    <div>
      <h4>Boundary balance</h4>
      <Row label="Charge" value={deficits.charge ?? 0} />
      <Row label="Lepton #" value={deficits.lepton ?? 0} />
      <Row label="Baryon #" value={deficits.baryon ?? 0} />
      <Row label="Color triality" value={deficits.color ?? 0} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  const ok = Math.abs(value) < 1e-9;
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span style={{ color: ok ? "green" : "red" }}>
        {value} {ok ? "OK" : "X"}
      </span>
    </div>
  );
}

function extractDeficits(issues: GraphIssue[]): Deficits {
  const d: Deficits = {};
  for (const iss of issues) {
    const m = iss.detail.match(/deficit = ([-+\d.]+)/);
    const val = m ? Number(m[1]) : Number.NaN;
    if (iss.code === "CONSERVATION_CHARGE") d.charge = val;
    if (iss.code === "CONSERVATION_LEPTON") d.lepton = val;
    if (iss.code === "CONSERVATION_BARYON") d.baryon = val;
    if (iss.code === "CONSERVATION_COLOR") d.color = val;
  }
  return d;
}

export { extractDeficits };

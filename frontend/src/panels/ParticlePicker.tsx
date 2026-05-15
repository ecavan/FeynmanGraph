import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { CompletionOption, Particle } from "../api/types";

const api = new ApiClient();

interface Props {
  modelId: string;
  theoryId: string;
  knownPdgs: number[];
  unknownCount: number;
  allParticles: Particle[];
  onPick: (pdgId: number) => void;
}

export function ParticlePicker(props: Props) {
  const [legalPdgs, setLegalPdgs] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api
      .validateVertex({
        model_id: props.modelId,
        theory_id: props.theoryId,
        partial: { known_pdgs: props.knownPdgs, unknown_count: props.unknownCount },
      })
      .then((resp) => {
        if (!cancelled) {
          setLegalPdgs(new Set(resp.options.map((o: CompletionOption) => o.pdg_id)));
        }
      })
      .catch(() => {
        if (!cancelled) setLegalPdgs(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [props.modelId, props.theoryId, props.knownPdgs, props.unknownCount]);

  const sorted = [...props.allParticles].sort((a, b) => {
    const aLegal = legalPdgs.has(a.pdg_id);
    const bLegal = legalPdgs.has(b.pdg_id);
    if (aLegal !== bLegal) return aLegal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {sorted.map((p) => {
        const legal = legalPdgs.has(p.pdg_id);
        return (
          <li key={p.pdg_id} style={{ opacity: legal ? 1 : 0.5, padding: "2px 0" }}>
            <button
              type="button"
              onClick={() => props.onPick(p.pdg_id)}
              title={
                legal
                  ? "Completes a legal vertex in this theory"
                  : "Would violate the current model's vertex rules"
              }
              style={{
                background: "none",
                border: "1px solid #ccc",
                padding: "4px 8px",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
              {p.name} ({legal ? "legal" : "illegal"})
            </button>
          </li>
        );
      })}
    </ul>
  );
}

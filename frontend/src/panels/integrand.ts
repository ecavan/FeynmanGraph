export type Propagator = { momentum: string; mass: string };

const MASSLESS = new Set(["ZERO", "0", ""]);

function sq(mom: string): string {
  return /^[A-Za-z]+(_(\d+|\(\d+\)))?$/.test(mom) ? `${mom}^2` : `(${mom})^2`;
}

export function buildIntegrandTypst(
  numerator: string,
  propagators: Propagator[],
): string {
  const measure = "integral (dif^d k)/(2 pi)^d";
  if (propagators.length === 0) {
    return `${measure} (${numerator})`;
  }
  const denom = propagators
    .map((p) =>
      MASSLESS.has(p.mass)
        ? `(${sq(p.momentum)})`
        : `(${sq(p.momentum)} - "${p.mass}"^2)`,
    )
    .join(" ");
  return `${measure} (${numerator})/(${denom})`;
}

// Only the fields actually needed — keeps this decoupled from the full store types.
type EdgeLike = {
  sourceNodeId: string;
  targetNodeId: string;
  particlePdgId: number | null;
};
type LegLike = { nodeId: string };
type ModelLike = { particles: { pdg_id: number; mass: string }[] } | null;

export function propagatorsFromState(
  edges: EdgeLike[],
  externalLegs: LegLike[],
  model: ModelLike,
): Propagator[] {
  const externalNodeIds = new Set(externalLegs.map((l) => l.nodeId));
  return edges
    .filter(
      (e) =>
        !externalNodeIds.has(e.sourceNodeId) &&
        !externalNodeIds.has(e.targetNodeId),
    )
    .map((e, i) => {
      const pdg = e.particlePdgId;
      const particle =
        pdg != null
          ? model?.particles.find((p) => p.pdg_id === Math.abs(pdg))
          : undefined;
      return { momentum: `q_${i + 1}`, mass: particle?.mass ?? "ZERO" };
    });
}

// Converts a gammaloop `lmb_rep` momentum string (e.g. "-1*K(1,a___)+P(0,a___)")
// into typst math: K(i) -> loop momentum (k, or k_(i) for i>=1), P(i) -> external p_(i).
export function lmbRepToTypst(lmbRep: string): string {
  const term = /^(?:(-?\d+)\*)?([KP])\((\d+),/;
  const parts = lmbRep
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(term);
      if (!m) return { sign: "+", body: t };
      const coeff = m[1] ? Number(m[1]) : 1;
      const idx = m[3];
      const sym =
        m[2] === "K" ? (idx === "0" ? "k" : `k_(${idx})`) : `p_(${idx})`;
      const mag = Math.abs(coeff);
      return {
        sign: coeff < 0 ? "-" : "+",
        body: mag === 1 ? sym : `${mag} ${sym}`,
      };
    });
  return parts
    .map((p, i) =>
      i === 0
        ? p.sign === "-"
          ? `-${p.body}`
          : p.body
        : ` ${p.sign} ${p.body}`,
    )
    .join("")
    .trim();
}

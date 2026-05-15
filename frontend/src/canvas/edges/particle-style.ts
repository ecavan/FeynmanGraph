// Maps a PDG id to a textbook-style rendering convention, and builds SVG path
// strings for the wave-shaped variants.
//
// Style conventions (Peskin/Schroeder, Srednicki):
//   fermion (quarks, leptons)   solid line + arrow at midpoint
//   photon  (γ, W, Z)           sine wave
//   gluon   (g)                 squiggle / coil
//   scalar  (Higgs, BSM scalar) dashed line
//   ghost   (ghosts)            dotted line
//   unknown (uncategorized PDG) thin solid grey line
//
// Colors match FeynmanAPI's TikZ-Feynman palette:
//   fermion = blue, photon = orange, gluon = green, scalar = violet,
//   ghost = grey.

export type ParticleStyle = "fermion" | "photon" | "wboson" | "gluon" | "scalar" | "ghost" | "unknown";

/** Human-readable symbol for common SM PDG ids. Falls back to particle name. */
const PDG_SYMBOLS: Record<number, string> = {
  22: "γ", 21: "g", 23: "Z", 24: "W⁺", [-24]: "W⁻", 25: "H",
  11: "e⁻", [-11]: "e⁺", 13: "μ⁻", [-13]: "μ⁺", 15: "τ⁻", [-15]: "τ⁺",
  12: "νₑ", [-12]: "ν̄ₑ", 14: "νμ", [-14]: "ν̄μ", 16: "ντ", [-16]: "ν̄τ",
  1: "d", [-1]: "d̄", 2: "u", [-2]: "ū", 3: "s", [-3]: "s̄",
  4: "c", [-4]: "c̄", 5: "b", [-5]: "b̄", 6: "t", [-6]: "t̄",
};

/** Render-time label for an edge. Uses a textbook symbol if known, else the
 *  particle name from the model, else "?". */
export function particleLabel(pdg: number | null | undefined, name?: string | null): string {
  if (pdg == null) return "?";
  return PDG_SYMBOLS[pdg] ?? name ?? `${pdg}`;
}

/** PDG ids that should NOT appear in the default particle palette. Includes
 *  ghosts and Goldstone bosons. UI offers a "show all" toggle for the rest. */
export function isGhostOrGoldstone(pdg: number): boolean {
  const a = Math.abs(pdg);
  // Ghosts: PDG 9 (FeynRules), 82, 83 (gammaloop SM convention)
  if (a === 9 || a === 82 || a === 83) return true;
  // Goldstone bosons in gammaloop SM: PDG ±250, ±251
  if (a === 250 || a === 251) return true;
  // FeynRules ghost convention: PDG > 9000000 (negative range used)
  if (a >= 9000000) return true;
  return false;
}

/** Sort order for the particle palette: gauge bosons → scalars → leptons →
 *  quarks → others. Within each group, particles come before antiparticles. */
export function paletteSortKey(pdg: number): [number, number] {
  const groupOrder: Record<ParticleStyle, number> = {
    photon: 0,
    wboson: 0,
    gluon: 0,
    scalar: 1,
    fermion: 2,
    ghost: 9,
    unknown: 10,
  };
  return [groupOrder[styleForPdg(pdg)], pdg];
}

const QUARK_PDGS: Set<number> = new Set([1, 2, 3, 4, 5, 6]);
const LEPTON_PDGS: Set<number> = new Set([11, 12, 13, 14, 15, 16]);

export function styleForPdg(pdg: number | null | undefined): ParticleStyle {
  if (pdg == null) return "unknown";
  const a = Math.abs(pdg);
  if (a === 21) return "gluon";
  if (a === 22) return "photon";
  // W and Z share their own style (red, thicker) so they don't look identical
  // to the photon — they are the same wavy line shape but visually distinct.
  if (a === 23 || a === 24) return "wboson";
  if (a === 25) return "scalar";
  if (QUARK_PDGS.has(a) || LEPTON_PDGS.has(a)) return "fermion";
  // Common ghost PDG ranges in UFO models: 9 (FeynRules placeholder), 82, 83, etc.
  // Treat anything in a "ghost-ish" range as ghost.
  if (a === 9 || a === 82 || a === 83) return "ghost";
  return "unknown";
}

// Sine wave between (x0,y0) and (x1,y1). Length-adaptive: aims for ~8
// oscillations on a typical edge so long edges don't look frantic.
export function wavyPath(
  x0: number, y0: number, x1: number, y1: number,
  opts: { amplitude?: number; cycles?: number } = {},
): string {
  const amplitude = opts.amplitude ?? 5;
  const targetCycles = opts.cycles ?? 8;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  // Use targetCycles for medium edges; clamp wavelength to [16, 28] so very
  // short edges still show a wave and very long edges aren't shrunk to noise.
  const desiredLambda = L / targetCycles;
  const wavelength = Math.min(28, Math.max(16, desiredLambda));
  const steps = Math.max(12, Math.ceil(L / 3));
  const parts: string[] = [`M ${x0} ${y0}`];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sx = x0 + dx * t;
    const sy = y0 + dy * t;
    const wave = amplitude * Math.sin((2 * Math.PI * L * t) / wavelength);
    parts.push(`L ${(sx + px * wave).toFixed(2)} ${(sy + py * wave).toFixed(2)}`);
  }
  return parts.join(" ");
}

// Real textbook gluon helix. Renders a 3D helix projected obliquely so each
// cycle has both up/down AND forward/back motion — the path visibly loops
// over itself instead of degenerating into a sine wave (which is what the
// photon already is). The oblique projection is what makes a "spring viewed
// from the side" actually read as a spring rather than a flat wave.
export function coilPath(
  x0: number, y0: number, x1: number, y1: number,
  opts: { amplitude?: number; cycles?: number; tilt?: number } = {},
): string {
  const R = opts.amplitude ?? 6;
  const targetCycles = opts.cycles ?? 6;
  // tilt = fraction of helix "depth" projected back along the axis. 0 = pure
  // side view (flat sine wave). >0 = forward/back motion visible per loop.
  const tilt = opts.tilt ?? 0.6;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  const desiredLoopLen = L / targetCycles;
  const loopLen = Math.min(26, Math.max(14, desiredLoopLen));
  const cycles = Math.max(2, Math.round(L / loopLen));
  // Dense sampling per cycle so the projected helix is smooth.
  const samplesPerCycle = 24;
  const steps = cycles * samplesPerCycle;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = t * cycles * 2 * Math.PI;
    // 3D helix sampled in (axial, perp) plane with oblique projection:
    //   perp_y  = R*sin(theta)         — up/down oscillation, 0 at endpoints
    //   axial   = t*L + R*sin(theta+phase)*tilt — small forward/back swing
    // The π/2 phase shift between axial and perp turns a flat sine into a
    // visible loop: at the peak (up), the path is slightly ahead; at the
    // trough (down), it's slightly behind. Forward+back motion is what
    // reads as a "spring."
    const axial = t * L + R * Math.sin(theta + Math.PI / 2) * tilt;
    // Subtract the t=0 value of the axial offset so the path starts at axial=0.
    const axialAdjusted = axial - R * tilt;
    const perp = R * Math.sin(theta);
    const xw = x0 + ux * axialAdjusted + px * perp;
    const yw = y0 + uy * axialAdjusted + py * perp;
    parts.push(`${i === 0 ? "M" : "L"} ${xw.toFixed(2)} ${yw.toFixed(2)}`);
  }
  return parts.join(" ");
}

// Visual descriptor returned by styleProps for the renderer. Encodes BOTH the
// stroke styling AND the path string to use.
export type EdgeVisual = {
  path: string;          // SVG `d` attribute
  strokeDasharray?: string;
  showArrow: boolean;    // fermion arrow at midpoint
  stroke: string;
  strokeWidth: number;
};

export function visualForEdge(
  pdg: number | null | undefined,
  x0: number, y0: number, x1: number, y1: number,
): EdgeVisual {
  const style = styleForPdg(pdg);
  const straight = `M ${x0} ${y0} L ${x1} ${y1}`;
  // Colors match FeynmanAPI's TikZ-Feynman palette. W/Z get their own color
  // (red, thicker) so they read as clearly different from the photon (orange).
  switch (style) {
    case "fermion":
      return { path: straight, showArrow: true, stroke: "#234ea3", strokeWidth: 1.8 };
    case "photon":
      return { path: wavyPath(x0, y0, x1, y1), showArrow: false, stroke: "#e07a00", strokeWidth: 1.6 };
    case "wboson":
      return { path: wavyPath(x0, y0, x1, y1, { amplitude: 6 }), showArrow: false, stroke: "#c0392b", strokeWidth: 2.4 };
    case "gluon":
      return { path: coilPath(x0, y0, x1, y1), showArrow: false, stroke: "#2f8a3a", strokeWidth: 1.7 };
    case "scalar":
      return { path: straight, showArrow: false, stroke: "#7b3aa0", strokeWidth: 1.9, strokeDasharray: "7 4" };
    case "ghost":
      return { path: straight, showArrow: false, stroke: "#666", strokeWidth: 1.5, strokeDasharray: "1.5 4" };
    default:
      return { path: straight, showArrow: false, stroke: "#888", strokeWidth: 1.5 };
  }
}

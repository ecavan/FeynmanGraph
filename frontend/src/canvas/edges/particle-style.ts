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

export type ParticleStyle = "fermion" | "photon" | "gluon" | "scalar" | "ghost" | "unknown";

const QUARK_PDGS: Set<number> = new Set([1, 2, 3, 4, 5, 6]);
const LEPTON_PDGS: Set<number> = new Set([11, 12, 13, 14, 15, 16]);

export function styleForPdg(pdg: number | null | undefined): ParticleStyle {
  if (pdg == null) return "unknown";
  const a = Math.abs(pdg);
  if (a === 21) return "gluon";
  if (a === 22 || a === 23 || a === 24) return "photon";
  if (a === 25) return "scalar";
  if (QUARK_PDGS.has(a) || LEPTON_PDGS.has(a)) return "fermion";
  // Common ghost PDG ranges in UFO models: 9 (FeynRules placeholder), 82, 83, etc.
  // Treat anything in a "ghost-ish" range as ghost.
  if (a === 9 || a === 82 || a === 83) return "ghost";
  return "unknown";
}

// Sine wave between (x0,y0) and (x1,y1). Approximated as a polyline so we can
// fall back to a single SVG <path> with no extra markup.
export function wavyPath(
  x0: number, y0: number, x1: number, y1: number,
  opts: { amplitude?: number; wavelength?: number } = {},
): string {
  const amplitude = opts.amplitude ?? 5;
  const wavelength = opts.wavelength ?? 14;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  const steps = Math.max(8, Math.ceil(L / 2));
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

// Tight coil for gluons. Looks like a stretched spring viewed from the side:
// each period traces a small loop above the axis. Achieved by drawing many
// small circle arcs along the line.
export function coilPath(
  x0: number, y0: number, x1: number, y1: number,
  opts: { amplitude?: number; loopLength?: number } = {},
): string {
  const amplitude = opts.amplitude ?? 5.5;
  const loopLength = opts.loopLength ?? 11;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  // Each loop covers loopLength of arc length. The number of loops bends to fit.
  const loops = Math.max(2, Math.round(L / loopLength));
  const segLen = L / loops;
  const parts: string[] = [`M ${x0} ${y0}`];
  for (let i = 0; i < loops; i++) {
    const t0 = i * segLen;
    const t1 = (i + 1) * segLen;
    // Start and end on the axis; control points above to make a loop.
    const sxA = x0 + ux * t0;
    const syA = y0 + uy * t0;
    const sxB = x0 + ux * t1;
    const syB = y0 + uy * t1;
    // Cubic-bezier control points pulled up by `amplitude` and forward by
    // a small step to give the loop a leaning shape.
    const c1x = sxA + ux * (segLen * 0.3) + px * amplitude;
    const c1y = syA + uy * (segLen * 0.3) + py * amplitude;
    const c2x = sxB - ux * (segLen * 0.3) + px * amplitude;
    const c2y = syB - uy * (segLen * 0.3) + py * amplitude;
    parts.push(
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)},` +
      ` ${c2x.toFixed(2)} ${c2y.toFixed(2)},` +
      ` ${sxB.toFixed(2)} ${syB.toFixed(2)}`,
    );
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
  switch (style) {
    case "fermion":
      return { path: straight, showArrow: true, stroke: "#222", strokeWidth: 1.7 };
    case "photon":
      return { path: wavyPath(x0, y0, x1, y1), showArrow: false, stroke: "#1366c0", strokeWidth: 1.5 };
    case "gluon":
      return { path: coilPath(x0, y0, x1, y1), showArrow: false, stroke: "#7a3a99", strokeWidth: 1.5 };
    case "scalar":
      return { path: straight, showArrow: false, stroke: "#a85b00", strokeWidth: 1.7, strokeDasharray: "7 4" };
    case "ghost":
      return { path: straight, showArrow: false, stroke: "#666", strokeWidth: 1.5, strokeDasharray: "1.5 4" };
    default:
      return { path: straight, showArrow: false, stroke: "#888", strokeWidth: 1.5 };
  }
}

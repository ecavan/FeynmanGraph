export type ParticleStyle = "fermion" | "photon" | "wboson" | "zboson" | "gluon" | "scalar" | "ghost" | "unknown";

const PDG_SYMBOLS: Record<number, string> = {
  22: "γ", 21: "g", 23: "Z", 24: "W⁺", [-24]: "W⁻", 25: "H",
  11: "e⁻", [-11]: "e⁺", 13: "μ⁻", [-13]: "μ⁺", 15: "τ⁻", [-15]: "τ⁺",
  12: "νₑ", [-12]: "ν̄ₑ", 14: "νμ", [-14]: "ν̄μ", 16: "ντ", [-16]: "ν̄τ",
  1: "d", [-1]: "d̄", 2: "u", [-2]: "ū", 3: "s", [-3]: "s̄",
  4: "c", [-4]: "c̄", 5: "b", [-5]: "b̄", 6: "t", [-6]: "t̄",
};

export function particleLabel(pdg: number | null | undefined, name?: string | null): string {
  if (pdg == null) return "?";
  return PDG_SYMBOLS[pdg] ?? name ?? `${pdg}`;
}

export function isGhostOrGoldstone(pdg: number): boolean {
  const a = Math.abs(pdg);
  if (a === 9 || a === 82 || a === 83) return true;
  if (a === 250 || a === 251) return true;
  if (a >= 9000000) return true;
  return false;
}

export function paletteSortKey(pdg: number): [number, number] {
  const groupOrder: Record<ParticleStyle, number> = {
    photon: 0,
    wboson: 0,
    zboson: 0,
    gluon: 0,
    scalar: 1,
    fermion: 2,
    ghost: 9,
    unknown: 10,
  };
  return [groupOrder[styleForPdg(pdg)], pdg];
}

const QUARK_PDGS = new Set([1, 2, 3, 4, 5, 6]);
const LEPTON_PDGS = new Set([11, 12, 13, 14, 15, 16]);

export function styleForPdg(pdg: number | null | undefined): ParticleStyle {
  if (pdg == null) return "unknown";
  const a = Math.abs(pdg);
  if (a === 21) return "gluon";
  if (a === 22) return "photon";
  if (a === 24) return "wboson";
  if (a === 23) return "zboson";
  if (a === 25) return "scalar";
  if (QUARK_PDGS.has(a) || LEPTON_PDGS.has(a)) return "fermion";
  if (a === 9 || a === 82 || a === 83) return "ghost";
  return "unknown";
}

// Per-family fermion colors. Charged leptons and their neutrinos share a hue
// (a bit muted for the neutrino). Quark families progress warm→deep so heavier
// quarks read as "heavier" at a glance.
const FERMION_COLOR: Record<number, string> = {
  11: "#1f6dd3", 12: "#6da4d8",       // e family — blue
  13: "#10ad96", 14: "#6cc8b9",       // μ family — teal
  15: "#a04bc7", 16: "#c483d5",       // τ family — purple
  1:  "#b85c1a", 2:  "#d97a2b",       // d, u — orange/rust
  3:  "#c98a14", 4:  "#cba046",       // s, c — gold
  5:  "#7a263d", 6:  "#a32540",       // b, t — deep red
};

export function fermionColor(pdg: number): string {
  return FERMION_COLOR[Math.abs(pdg)] ?? "#234ea3";
}

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
  const wavelength = Math.min(28, Math.max(16, L / targetCycles));
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

// Sharper triangular zigzag for W/Z bosons — distinguishes them from the
// sinusoidal photon at a glance.
export function zigzagPath(
  x0: number, y0: number, x1: number, y1: number,
  opts: { amplitude?: number; cycles?: number } = {},
): string {
  const amplitude = opts.amplitude ?? 7;
  const targetCycles = opts.cycles ?? 6;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  const segLen = Math.min(22, Math.max(14, L / targetCycles));
  const cycles = Math.max(2, Math.round(L / segLen));
  const steps = cycles * 4;
  const parts: string[] = [`M ${x0.toFixed(2)} ${y0.toFixed(2)}`];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const phase = (t * cycles) % 1;
    const tri = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    const ax = t * L;
    const xw = x0 + ux * ax + px * amplitude * tri;
    const yw = y0 + uy * ax + py * amplitude * tri;
    parts.push(`L ${xw.toFixed(2)} ${yw.toFixed(2)}`);
  }
  return parts.join(" ");
}

// Oblique-projection helix so a gluon reads as a spring, not a sine wave.
// The π/2 phase shift between axial and perp gives the "loop overlaps itself"
// look; tighter loops + higher tilt make it more recognizably spirally.
export function coilPath(
  x0: number, y0: number, x1: number, y1: number,
  opts: { amplitude?: number; cycles?: number; tilt?: number } = {},
): string {
  const R = opts.amplitude ?? 6;
  const targetCycles = opts.cycles ?? 9;
  const tilt = opts.tilt ?? 0.85;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  const loopLen = Math.min(20, Math.max(10, L / targetCycles));
  const cycles = Math.max(2, Math.round(L / loopLen));
  const samplesPerCycle = 28;
  const steps = cycles * samplesPerCycle;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = t * cycles * 2 * Math.PI;
    const axial = t * L + R * Math.sin(theta + Math.PI / 2) * tilt - R * tilt;
    const perp = R * Math.sin(theta);
    const xw = x0 + ux * axial + px * perp;
    const yw = y0 + uy * axial + py * perp;
    parts.push(`${i === 0 ? "M" : "L"} ${xw.toFixed(2)} ${yw.toFixed(2)}`);
  }
  return parts.join(" ");
}

export type EdgeVisual = {
  path: string;
  strokeDasharray?: string;
  showArrow: boolean;
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
      return { path: straight, showArrow: true, stroke: pdg != null ? fermionColor(pdg) : "#234ea3", strokeWidth: 1.8 };
    case "photon":
      return { path: wavyPath(x0, y0, x1, y1), showArrow: false, stroke: "#e07a00", strokeWidth: 1.6 };
    case "wboson":
      return { path: zigzagPath(x0, y0, x1, y1), showArrow: false, stroke: "#c0392b", strokeWidth: 2.2 };
    case "zboson":
      return { path: zigzagPath(x0, y0, x1, y1, { amplitude: 6 }), showArrow: false, stroke: "#7a4a9c", strokeWidth: 2.2 };
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

// A spine is a parameterized curve from t=0 to t=1, providing position and
// unit tangent at each t. Lets us decorate (wave/zigzag/coil) along arbitrary
// shapes — straight lines, circles (self-loops), Bezier curves (parallel
// edges) — with the same code path that used to only handle straight lines.
export type SpineSample = { x: number; y: number; tx: number; ty: number };
export type Spine = {
  length: number;
  sample: (t: number) => SpineSample;
};

export function straightSpine(x0: number, y0: number, x1: number, y1: number): Spine {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) {
    return { length: 0, sample: () => ({ x: x0, y: y0, tx: 1, ty: 0 }) };
  }
  const tx = dx / L;
  const ty = dy / L;
  return {
    length: L,
    sample: (t) => ({ x: x0 + dx * t, y: y0 + dy * t, tx, ty }),
  };
}

// Full circle of radius r around (cx, cy), starting at angle `startAngle` and
// going CCW. t=0 and t=1 both land at the start point.
export function circleSpine(cx: number, cy: number, r: number, startAngle: number): Spine {
  return {
    length: 2 * Math.PI * r,
    sample: (t) => {
      const theta = startAngle + t * 2 * Math.PI;
      return {
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta),
        tx: -Math.sin(theta),
        ty: Math.cos(theta),
      };
    },
  };
}

export function quadraticSpine(
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
): Spine {
  // Arc length is approximated by a 32-step polyline — good enough to drive
  // wavelength/cycle calculations; doesn't need to be exact.
  const SAMPLES = 32;
  let L = 0;
  let prevX = x0;
  let prevY = y0;
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const omt = 1 - t;
    const x = omt * omt * x0 + 2 * omt * t * cx + t * t * x1;
    const y = omt * omt * y0 + 2 * omt * t * cy + t * t * y1;
    L += Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return {
    length: L,
    sample: (t) => {
      const omt = 1 - t;
      const x = omt * omt * x0 + 2 * omt * t * cx + t * t * x1;
      const y = omt * omt * y0 + 2 * omt * t * cy + t * t * y1;
      const tdx = 2 * omt * (cx - x0) + 2 * t * (x1 - cx);
      const tdy = 2 * omt * (cy - y0) + 2 * t * (y1 - cy);
      const TL = Math.hypot(tdx, tdy) || 1;
      return { x, y, tx: tdx / TL, ty: tdy / TL };
    },
  };
}

export function straightOnSpine(spine: Spine, samples = 24): string {
  const s0 = spine.sample(0);
  if (spine.length < 1) return `M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`;
  const parts: string[] = [`M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`];
  for (let i = 1; i <= samples; i++) {
    const s = spine.sample(i / samples);
    parts.push(`L ${s.x.toFixed(2)} ${s.y.toFixed(2)}`);
  }
  return parts.join(" ");
}

export function wavyOnSpine(
  spine: Spine,
  opts: { amplitude?: number; cycles?: number } = {},
): string {
  const amplitude = opts.amplitude ?? 5;
  const targetCycles = opts.cycles ?? 8;
  const L = spine.length;
  const s0 = spine.sample(0);
  if (L < 1) return `M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`;
  const wavelength = Math.min(28, Math.max(16, L / targetCycles));
  const steps = Math.max(12, Math.ceil(L / 3));
  const parts: string[] = [`M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const s = spine.sample(t);
    const px = -s.ty;
    const py = s.tx;
    const wave = amplitude * Math.sin((2 * Math.PI * L * t) / wavelength);
    parts.push(`L ${(s.x + px * wave).toFixed(2)} ${(s.y + py * wave).toFixed(2)}`);
  }
  return parts.join(" ");
}

export function zigzagOnSpine(
  spine: Spine,
  opts: { amplitude?: number; cycles?: number } = {},
): string {
  const amplitude = opts.amplitude ?? 7;
  const targetCycles = opts.cycles ?? 6;
  const L = spine.length;
  const s0 = spine.sample(0);
  if (L < 1) return `M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`;
  const segLen = Math.min(22, Math.max(14, L / targetCycles));
  const cycles = Math.max(2, Math.round(L / segLen));
  const steps = cycles * 4;
  const parts: string[] = [`M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const phase = (t * cycles) % 1;
    const tri = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    const s = spine.sample(t);
    const px = -s.ty;
    const py = s.tx;
    parts.push(
      `L ${(s.x + px * amplitude * tri).toFixed(2)} ${(s.y + py * amplitude * tri).toFixed(2)}`,
    );
  }
  return parts.join(" ");
}

export function coilOnSpine(
  spine: Spine,
  opts: { amplitude?: number; cycles?: number; tilt?: number } = {},
): string {
  const R = opts.amplitude ?? 6;
  const targetCycles = opts.cycles ?? 9;
  const tilt = opts.tilt ?? 0.85;
  const L = spine.length;
  if (L < 1) {
    const s = spine.sample(0);
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)}`;
  }
  const loopLen = Math.min(20, Math.max(10, L / targetCycles));
  const cycles = Math.max(2, Math.round(L / loopLen));
  const samplesPerCycle = 28;
  const steps = cycles * samplesPerCycle;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = t * cycles * 2 * Math.PI;
    const tangentOffset = R * Math.sin(theta + Math.PI / 2) * tilt - R * tilt;
    const perp = R * Math.sin(theta);
    const s = spine.sample(t);
    const px = -s.ty;
    const py = s.tx;
    const xw = s.x + s.tx * tangentOffset + px * perp;
    const yw = s.y + s.ty * tangentOffset + py * perp;
    parts.push(`${i === 0 ? "M" : "L"} ${xw.toFixed(2)} ${yw.toFixed(2)}`);
  }
  return parts.join(" ");
}

export function visualForSpine(
  pdg: number | null | undefined,
  spine: Spine,
): EdgeVisual {
  const style = styleForPdg(pdg);
  switch (style) {
    case "fermion":
      return { path: straightOnSpine(spine), showArrow: true, stroke: pdg != null ? fermionColor(pdg) : "#234ea3", strokeWidth: 1.8 };
    case "photon":
      return { path: wavyOnSpine(spine), showArrow: false, stroke: "#e07a00", strokeWidth: 1.6 };
    case "wboson":
      return { path: zigzagOnSpine(spine), showArrow: false, stroke: "#c0392b", strokeWidth: 2.2 };
    case "zboson":
      return { path: zigzagOnSpine(spine, { amplitude: 6 }), showArrow: false, stroke: "#7a4a9c", strokeWidth: 2.2 };
    case "gluon":
      return { path: coilOnSpine(spine), showArrow: false, stroke: "#2f8a3a", strokeWidth: 1.7 };
    case "scalar":
      return { path: straightOnSpine(spine), showArrow: false, stroke: "#7b3aa0", strokeWidth: 1.9, strokeDasharray: "7 4" };
    case "ghost":
      return { path: straightOnSpine(spine), showArrow: false, stroke: "#666", strokeWidth: 1.5, strokeDasharray: "1.5 4" };
    default:
      return { path: straightOnSpine(spine), showArrow: false, stroke: "#888", strokeWidth: 1.5 };
  }
}

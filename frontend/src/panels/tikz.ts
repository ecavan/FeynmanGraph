import { styleForPdg } from "../canvas/edges/particle-style";
import type { DiagramState } from "../state/diagram";

const TIKZ_SCALE = 1 / 50;

const STYLE_MAP: Record<string, string> = {
  photon: "photon",
  gluon: "gluon",
  wboson: "boson",
  zboson: "boson",
  scalar: "scalar",
  ghost: "ghost",
  fermion: "fermion",
  unknown: "plain",
};

function tikzName(id: string): string {
  return `n${id.replace(/[^a-zA-Z0-9]/g, "")}`;
}

function tikzLabel(name: string): string {
  return name
    .replace(/~$/, "")
    .replace(/^mu/, "\\mu")
    .replace(/^nu/, "\\nu")
    .replace(/^tau/, "\\tau")
    .replace(/^gamma/, "\\gamma")
    .replace(/\+$/, "^+")
    .replace(/-$/, "^-");
}

export type TikzInput = Pick<DiagramState, "nodes" | "edges" | "externalLegs" | "cachedModel">;

export function toTikz(state: TikzInput): string {
  const { nodes, edges, externalLegs, cachedModel } = state;
  const lines: string[] = ["\\begin{tikzpicture}", "\\begin{feynman}"];

  for (const n of nodes) {
    const leg = externalLegs.find((l) => l.nodeId === n.id);
    const x = (n.position[0] * TIKZ_SCALE).toFixed(2);
    const y = (-n.position[1] * TIKZ_SCALE).toFixed(2);
    const label = leg ? ` {\\(${tikzLabel(leg.label)}\\)}` : "";
    lines.push(`  \\vertex (${tikzName(n.id)}) at (${x}, ${y})${label};`);
  }

  lines.push("  \\diagram*{");
  edges.forEach((e, i) => {
    const style = STYLE_MAP[styleForPdg(e.particlePdgId)] ?? "plain";
    const pname =
      e.particlePdgId != null
        ? cachedModel?.particles.find((p) => p.pdg_id === e.particlePdgId)?.name
        : undefined;
    const labelOpt = pname ? `, edge label=\\(${tikzLabel(pname)}\\)` : "";
    const comma = i < edges.length - 1 ? "," : "";
    lines.push(
      `    (${tikzName(e.sourceNodeId)}) -- [${style}${labelOpt}] (${tikzName(e.targetNodeId)})${comma}`,
    );
  });
  lines.push("  };", "\\end{feynman}", "\\end{tikzpicture}");

  return lines.join("\n");
}

import type { ExternalLeg, ParticleEdge, VertexNode } from "../state/diagram";

const LEG_LEFT_X = -260;
const LEG_RIGHT_X = 260;
const LEG_VERTICAL_SPACING = 110;
const TARGET_EDGE_LENGTH = 130;
const REPULSION_K = 9000;
const SPRING_K = 0.05;
const CENTERING_K = 0.02;
const DAMPING = 0.85;
const ITERATIONS = 220;

type Layout = {
  nodes: VertexNode[];
  externalLegs: ExternalLeg[];
};

export function relayout(
  nodes: VertexNode[],
  edges: ParticleEdge[],
  externalLegs: ExternalLeg[],
): Layout {
  if (nodes.length === 0) return { nodes, externalLegs };

  const incoming = externalLegs.filter((l) => l.kind === "incoming").map((l) => l.nodeId);
  const outgoing = externalLegs.filter((l) => l.kind === "outgoing").map((l) => l.nodeId);
  const externalSet = new Set([...incoming, ...outgoing]);
  const internal = nodes.filter((n) => !externalSet.has(n.id)).map((n) => n.id);

  const positions = new Map<string, [number, number]>();
  incoming.forEach((id, i) => {
    const y = (i - (incoming.length - 1) / 2) * LEG_VERTICAL_SPACING;
    positions.set(id, [LEG_LEFT_X, y]);
  });
  outgoing.forEach((id, i) => {
    const y = (i - (outgoing.length - 1) / 2) * LEG_VERTICAL_SPACING;
    positions.set(id, [LEG_RIGHT_X, y]);
  });
  internal.forEach((id, i) => {
    const t = internal.length <= 1 ? 0 : i / (internal.length - 1) - 0.5;
    positions.set(id, [t * 120, 0]);
  });

  const velocities = new Map<string, [number, number]>();
  internal.forEach((id) => velocities.set(id, [0, 0]));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forces = new Map<string, [number, number]>();
    internal.forEach((id) => forces.set(id, [0, 0]));

    for (const idA of internal) {
      const [ax, ay] = positions.get(idA) as [number, number];
      for (const nB of nodes) {
        if (nB.id === idA) continue;
        const [bx, by] = positions.get(nB.id) as [number, number];
        const dx = ax - bx;
        const dy = ay - by;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const f = REPULSION_K / distSq;
        const fcur = forces.get(idA) as [number, number];
        forces.set(idA, [fcur[0] + (dx / dist) * f, fcur[1] + (dy / dist) * f]);
      }
    }

    for (const e of edges) {
      const [ax, ay] = positions.get(e.sourceNodeId) as [number, number];
      const [bx, by] = positions.get(e.targetNodeId) as [number, number];
      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy) + 0.01;
      const stretch = dist - TARGET_EDGE_LENGTH;
      const fx = (dx / dist) * stretch * SPRING_K;
      const fy = (dy / dist) * stretch * SPRING_K;
      if (forces.has(e.sourceNodeId)) {
        const cur = forces.get(e.sourceNodeId) as [number, number];
        forces.set(e.sourceNodeId, [cur[0] + fx, cur[1] + fy]);
      }
      if (forces.has(e.targetNodeId)) {
        const cur = forces.get(e.targetNodeId) as [number, number];
        forces.set(e.targetNodeId, [cur[0] - fx, cur[1] - fy]);
      }
    }

    for (const id of internal) {
      const [px, py] = positions.get(id) as [number, number];
      const cur = forces.get(id) as [number, number];
      forces.set(id, [cur[0] - px * CENTERING_K, cur[1] - py * CENTERING_K]);
    }

    for (const id of internal) {
      const [fx, fy] = forces.get(id) as [number, number];
      const [vx, vy] = velocities.get(id) as [number, number];
      const nvx = (vx + fx) * DAMPING;
      const nvy = (vy + fy) * DAMPING;
      velocities.set(id, [nvx, nvy]);
      const [px, py] = positions.get(id) as [number, number];
      positions.set(id, [px + nvx, py + nvy]);
    }
  }

  return {
    nodes: nodes.map((n) => {
      const p = positions.get(n.id);
      return p ? { ...n, position: p } : n;
    }),
    externalLegs,
  };
}

export function spawnPositionForNewVertex(nodes: VertexNode[]): [number, number] {
  if (nodes.length === 0) return [0, 0];
  const cx = nodes.reduce((s, n) => s + n.position[0], 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.position[1], 0) / nodes.length;
  const offset = ((nodes.length % 6) * Math.PI) / 3;
  return [cx + Math.cos(offset) * 60, cy + Math.sin(offset) * 60];
}

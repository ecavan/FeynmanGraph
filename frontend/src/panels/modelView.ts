import type { Model, Particle, Vertex } from "../api/types";

export function vertexParticleNames(
  vertex: Vertex,
  particles: Particle[],
): string[] {
  const nameByPdg = new Map<number, string>();
  for (const p of particles) {
    nameByPdg.set(p.pdg_id, p.name);
    nameByPdg.set(-p.pdg_id, p.anti_name);
  }
  return vertex.particles.map((pdg) => nameByPdg.get(pdg) ?? `pdg:${pdg}`);
}

export function filterModel(
  model: Model,
  query: string,
): { particles: Particle[]; vertices: Vertex[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { particles: model.particles, vertices: model.vertices };
  const particles = model.particles.filter((p) =>
    p.name.toLowerCase().includes(q),
  );
  const vertices = model.vertices.filter((v) =>
    vertexParticleNames(v, model.particles).some((n) =>
      n.toLowerCase().includes(q),
    ),
  );
  return { particles, vertices };
}

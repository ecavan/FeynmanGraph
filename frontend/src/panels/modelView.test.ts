import { describe, expect, it } from "vitest";
import type { Model } from "../api/types";
import { filterModel, vertexParticleNames } from "./modelView";

const model = {
  id: "sm",
  name: "Standard Model",
  particles: [
    { pdg_id: 11, name: "e-", anti_name: "e+", mass: "Me", charge: -1, spin: 1, color_rep: 1 },
    { pdg_id: 22, name: "a", anti_name: "a", mass: "ZERO", charge: 0, spin: 2, color_rep: 1 },
  ],
  vertices: [{ id: "V1", particles: [11, -11, 22] }],
} as unknown as Model;

describe("vertexParticleNames", () => {
  it("maps pdg ids to names, with anti- fallback by sign", () => {
    expect(vertexParticleNames(model.vertices[0], model.particles)).toEqual(["e-", "e+", "a"]);
  });
  it("falls back to pdg:<id> for unknown ids", () => {
    expect(vertexParticleNames({ id: "X", particles: [99] }, model.particles)).toEqual(["pdg:99"]);
  });
});

describe("filterModel", () => {
  it("returns everything for an empty query", () => {
    const r = filterModel(model, "  ");
    expect(r.particles).toHaveLength(2);
    expect(r.vertices).toHaveLength(1);
  });
  it("narrows particles and vertices by particle name", () => {
    const r = filterModel(model, "e-");
    expect(r.particles.map((p) => p.name)).toEqual(["e-"]);
    expect(r.vertices).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import type { Model } from "../api/types";
import { toTikz } from "./tikz";

const model = (parts: { pdg_id: number; name: string }[]) =>
  ({ particles: parts }) as unknown as Model;

describe("toTikz", () => {
  it("emits tikz-feynman and maps a photon edge to [photon]", () => {
    const out = toTikz({
      nodes: [
        { id: "v1", position: [0, 0] },
        { id: "v2", position: [100, 0] },
      ],
      edges: [{ id: "e1", sourceNodeId: "v1", targetNodeId: "v2", particlePdgId: 22 }],
      externalLegs: [],
      cachedModel: model([{ pdg_id: 22, name: "a" }]),
    });
    expect(out).toContain("\\begin{feynman}");
    expect(out).toContain("\\end{tikzpicture}");
    expect(out).toContain("\\vertex (nv1)");
    expect(out).toContain("(nv1) -- [photon");
  });

  it("maps a fermion edge and latexifies an external-leg label", () => {
    const out = toTikz({
      nodes: [
        { id: "a", position: [0, 0] },
        { id: "b", position: [50, 50] },
      ],
      edges: [{ id: "e", sourceNodeId: "a", targetNodeId: "b", particlePdgId: 11 }],
      externalLegs: [{ nodeId: "a", kind: "incoming", label: "e-" }],
      cachedModel: model([{ pdg_id: 11, name: "e-" }]),
    });
    expect(out).toContain("[fermion");
    expect(out).toContain("{\\(e^-\\)}");
  });
});

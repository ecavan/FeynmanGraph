import { describe, expect, it } from "vitest";
import {
  buildIntegrandTypst,
  lmbRepToTypst,
  propagatorsFromState,
} from "./integrand";

describe("buildIntegrandTypst", () => {
  it("wraps the numerator in the loop measure over the propagator product", () => {
    const out = buildIntegrandTypst("NUM", [
      { momentum: "q_1", mass: "Me" },
      { momentum: "q_2", mass: "ZERO" },
    ]);
    expect(out).toContain("integral"); // loop measure
    expect(out).toContain("(NUM)"); // numerator embedded
    expect(out).toContain('(q_1^2 - "Me"^2)'); // massive propagator
    expect(out).toContain("(q_2^2)"); // massless propagator: ZERO -> just q^2
  });

  it("parenthesizes multi-term and negative momenta before squaring", () => {
    const out = buildIntegrandTypst("N", [
      { momentum: "-p_(0) + k", mass: "MZ" },
      { momentum: "-k", mass: "ZERO" },
    ]);
    expect(out).toContain('((-p_(0) + k)^2 - "MZ"^2)');
    expect(out).toContain("((-k)^2)");
  });

  it("drops the denominator when there are no propagators", () => {
    const out = buildIntegrandTypst("NUM", []);
    expect(out).toContain("integral");
    expect(out).toContain("(NUM)");
    expect(out).not.toContain("(NUM)/"); // numerator is not placed over a denominator
  });
});

describe("propagatorsFromState", () => {
  it("keeps only internal edges and resolves each mass from the model", () => {
    const edges = [
      { sourceNodeId: "ext1", targetNodeId: "v1", particlePdgId: 11 }, // external line — excluded
      { sourceNodeId: "v1", targetNodeId: "v2", particlePdgId: 6 }, // internal (top)
      { sourceNodeId: "v2", targetNodeId: "v1", particlePdgId: 22 }, // internal (photon)
    ];
    const legs = [{ nodeId: "ext1" }];
    const model = {
      particles: [
        { pdg_id: 6, mass: "MT" },
        { pdg_id: 22, mass: "ZERO" },
      ],
    };
    const props = propagatorsFromState(edges, legs, model);
    expect(props).toHaveLength(2);
    expect(props.map((p) => p.mass)).toEqual(["MT", "ZERO"]);
    expect(props.map((p) => p.momentum)).toEqual(["q_1", "q_2"]);
  });

  it("falls back to massless when an edge has no particle assigned", () => {
    const props = propagatorsFromState(
      [{ sourceNodeId: "v1", targetNodeId: "v2", particlePdgId: null }],
      [],
      { particles: [] },
    );
    expect(props).toEqual([{ momentum: "q_1", mass: "ZERO" }]);
  });
});

describe("lmbRepToTypst", () => {
  it("renders the single loop momentum K(0) as k", () => {
    expect(lmbRepToTypst("K(0,a___)")).toBe("k");
  });
  it("renders an external momentum P(i) as p_(i)", () => {
    expect(lmbRepToTypst("P(0,a___)")).toBe("p_(0)");
  });
  it("renders loop minus external", () => {
    expect(lmbRepToTypst("-1*K(0,a___)+P(0,a___)")).toBe("-k + p_(0)");
  });
  it("renders a sum of loop and two externals", () => {
    expect(lmbRepToTypst("K(0,a___)+P(0,a___)+P(1,a___)")).toBe(
      "k + p_(0) + p_(1)",
    );
  });
  it("renders higher loop indices with a subscript", () => {
    expect(lmbRepToTypst("K(1,a___)")).toBe("k_(1)");
  });
});

import { describe, expect, it } from "vitest";
import { coilPath, styleForPdg, visualForEdge, wavyPath } from "./particle-style";

describe("styleForPdg", () => {
  it("classifies SM bosons by PDG id", () => {
    expect(styleForPdg(21)).toBe("gluon");
    expect(styleForPdg(22)).toBe("photon");
    expect(styleForPdg(23)).toBe("photon");
    expect(styleForPdg(24)).toBe("photon");
    expect(styleForPdg(-24)).toBe("photon");
    expect(styleForPdg(25)).toBe("scalar");
  });

  it("classifies SM fermions (quarks 1-6, leptons 11-16, plus antiparticles)", () => {
    for (const pdg of [1, 2, 3, 4, 5, 6, -1, -6]) {
      expect(styleForPdg(pdg)).toBe("fermion");
    }
    for (const pdg of [11, 12, 13, 14, 15, 16, -11, -16]) {
      expect(styleForPdg(pdg)).toBe("fermion");
    }
  });

  it("returns 'unknown' for null and exotic PDG", () => {
    expect(styleForPdg(null)).toBe("unknown");
    expect(styleForPdg(undefined)).toBe("unknown");
    expect(styleForPdg(99)).toBe("unknown");
  });
});

describe("wavyPath and coilPath", () => {
  it("wavyPath produces a path starting at the source and ending near the target", () => {
    const d = wavyPath(0, 0, 100, 0);
    expect(d.startsWith("M 0 0")).toBe(true);
    // Should contain enough line segments for a visible wave
    expect((d.match(/ L /g) ?? []).length).toBeGreaterThan(10);
  });

  it("coilPath produces a series of cubic-bezier loops", () => {
    const d = coilPath(0, 0, 100, 0);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect((d.match(/ C /g) ?? []).length).toBeGreaterThan(1);
  });

  it("both functions degenerate to a straight line for very short edges", () => {
    expect(wavyPath(10, 10, 10.2, 10.1)).toBe("M 10 10 L 10.2 10.1");
    expect(coilPath(10, 10, 10.2, 10.1)).toBe("M 10 10 L 10.2 10.1");
  });
});

describe("visualForEdge", () => {
  it("fermion has arrow and no dasharray", () => {
    const v = visualForEdge(11, 0, 0, 100, 0);
    expect(v.showArrow).toBe(true);
    expect(v.strokeDasharray).toBeUndefined();
  });

  it("scalar (Higgs) has dashed stroke and no arrow", () => {
    const v = visualForEdge(25, 0, 0, 100, 0);
    expect(v.showArrow).toBe(false);
    expect(v.strokeDasharray).toBeTruthy();
  });

  it("photon path differs from a straight line", () => {
    const v = visualForEdge(22, 0, 0, 100, 0);
    expect(v.path).not.toBe("M 0 0 L 100 0");
    expect(v.showArrow).toBe(false);
  });

  it("gluon uses bezier curves (cubic)", () => {
    const v = visualForEdge(21, 0, 0, 100, 0);
    expect(v.path).toContain("C ");
  });

  it("unknown PDG falls back to a plain straight line", () => {
    const v = visualForEdge(null, 0, 0, 100, 0);
    expect(v.path).toBe("M 0 0 L 100 0");
    expect(v.showArrow).toBe(false);
    expect(v.strokeDasharray).toBeUndefined();
  });
});

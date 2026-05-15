import { describe, expect, it } from "vitest";
import { coilPath, styleForPdg, visualForEdge, wavyPath } from "./particle-style";

describe("styleForPdg", () => {
  it("classifies SM bosons by PDG id", () => {
    expect(styleForPdg(21)).toBe("gluon");
    expect(styleForPdg(22)).toBe("photon");
    // W/Z get their own style so they look distinct from the photon.
    expect(styleForPdg(23)).toBe("wboson");
    expect(styleForPdg(24)).toBe("wboson");
    expect(styleForPdg(-24)).toBe("wboson");
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

  it("coilPath produces many sample points along the oblique helix", () => {
    const d = coilPath(0, 0, 100, 0);
    // Path starts at the source endpoint (modulo float rounding) and is sampled
    // as a dense polyline of many short segments.
    expect(d).toMatch(/^M 0\.?0*\s+0\.?0*/);
    expect((d.match(/ L /g) ?? []).length).toBeGreaterThan(40);
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

  it("gluon path is a dense polyline (oblique helix samples)", () => {
    const v = visualForEdge(21, 0, 0, 100, 0);
    expect((v.path.match(/ L /g) ?? []).length).toBeGreaterThan(40);
    expect(v.path).not.toBe("M 0 0 L 100 0");
  });

  it("wboson (W/Z) is wavy + thicker + red, distinct from photon", () => {
    const w = visualForEdge(24, 0, 0, 100, 0);
    const z = visualForEdge(23, 0, 0, 100, 0);
    const gamma = visualForEdge(22, 0, 0, 100, 0);
    expect(w.stroke).toBe(z.stroke);
    expect(w.stroke).not.toBe(gamma.stroke);
    expect(w.strokeWidth).toBeGreaterThan(gamma.strokeWidth);
  });

  it("unknown PDG falls back to a plain straight line", () => {
    const v = visualForEdge(null, 0, 0, 100, 0);
    expect(v.path).toBe("M 0 0 L 100 0");
    expect(v.showArrow).toBe(false);
    expect(v.strokeDasharray).toBeUndefined();
  });
});

describe("particleLabel + filtering helpers", () => {
  it("uses textbook symbols for common SM particles", async () => {
    const { particleLabel } = await import("./particle-style");
    expect(particleLabel(22)).toBe("γ");
    expect(particleLabel(21)).toBe("g");
    expect(particleLabel(23)).toBe("Z");
    expect(particleLabel(24)).toBe("W⁺");
    expect(particleLabel(-24)).toBe("W⁻");
    expect(particleLabel(25)).toBe("H");
    expect(particleLabel(11)).toBe("e⁻");
    expect(particleLabel(-11)).toBe("e⁺");
  });

  it("falls back to the particle name for unknown PDGs", async () => {
    const { particleLabel } = await import("./particle-style");
    expect(particleLabel(999, "X")).toBe("X");
    expect(particleLabel(999)).toBe("999");
    expect(particleLabel(null)).toBe("?");
  });

  it("isGhostOrGoldstone marks ghost ranges", async () => {
    const { isGhostOrGoldstone } = await import("./particle-style");
    expect(isGhostOrGoldstone(82)).toBe(true);
    expect(isGhostOrGoldstone(83)).toBe(true);
    expect(isGhostOrGoldstone(9)).toBe(true);
    expect(isGhostOrGoldstone(250)).toBe(true);
    expect(isGhostOrGoldstone(-251)).toBe(true);
    expect(isGhostOrGoldstone(9000005)).toBe(true);
    // Non-ghosts pass through
    expect(isGhostOrGoldstone(22)).toBe(false);
    expect(isGhostOrGoldstone(11)).toBe(false);
    expect(isGhostOrGoldstone(25)).toBe(false);
  });

  it("paletteSortKey groups bosons before fermions, ghosts last", async () => {
    const { paletteSortKey } = await import("./particle-style");
    expect(paletteSortKey(22)[0]).toBeLessThan(paletteSortKey(11)[0]); // photon before electron
    expect(paletteSortKey(25)[0]).toBeLessThan(paletteSortKey(11)[0]); // scalar before fermion
    expect(paletteSortKey(11)[0]).toBeLessThan(paletteSortKey(82)[0]); // fermion before ghost
  });
});

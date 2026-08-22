import { describe, expect, it } from "vitest";

import { slashMomenta } from "./pslash";

describe("slashMomenta", () => {
  it("collapses a momentum contracted with a gamma into a slashed momentum", () => {
    // The internal-propagator (m + q̸) structure: q₄ contracted with γ on the
    // shared dummy Minkowski index α_(ᵉ⁴.¹).
    const raw = "q₄^(α_(ᵉ⁴.¹)) γ^(α_(ᵉ⁴.¹),b_(⁵) b_(⁴))";
    expect(slashMomenta(raw)).toBe("cancel(q₄)^(b_(⁵) b_(⁴))");
  });

  it("also slashes a loop momentum k", () => {
    const raw = "k₀^(α_(⁷)) γ^(α_(⁷),b_(¹) b_(²))";
    expect(slashMomenta(raw)).toBe("cancel(k₀)^(b_(¹) b_(²))");
  });

  it("leaves a gamma contracted with a polarization (ϵ) unchanged", () => {
    // ϵ is not a momentum, so its γ^μ stays explicit.
    const raw = "ϵ₁^(α_(¹)) γ^(α_(¹),b_(⁴) b_(⁰))";
    expect(slashMomenta(raw)).toBe(raw);
  });

  it("slashes only the propagator gamma in a full Compton numerator", () => {
    const raw =
      '1𝑖 "GC_3"² ("Me" g^(b_(⁴) b_(⁵))+q₄^(α_(ᵉ⁴.¹)) γ^(α_(ᵉ⁴.¹),b_(⁵) b_(⁴))) u̅₂^(b_(²)) u₀^(b_(⁰)) ϵ₁^(α_(¹)) ϵ̅₃^(α_(³)) γ^(α_(³),b_(²) b_(⁵)) γ^(α_(¹),b_(⁴) b_(⁰))';
    const out = slashMomenta(raw);
    expect(out).toContain("cancel(q₄)^(b_(⁵) b_(⁴))");
    // the two photon gammas (contracted with ϵ) are untouched:
    expect(out).toContain("γ^(α_(³),b_(²) b_(⁵))");
    expect(out).toContain("γ^(α_(¹),b_(⁴) b_(⁰))");
    // the momentum was consumed into the slash:
    expect(out).not.toContain("q₄^(");
  });
});

// Renders slashed momenta (p̸) in the numerator: a momentum contracted with a
// gamma on a shared dummy Minkowski index is the Dirac slash `p̸ = γ_μ p^μ`.
//
//   q₄^(α_(X)) γ^(α_(X),b_(⁵) b_(⁴))   →   cancel(q₄)^(b_(⁵) b_(⁴))
//
// (Typst `cancel` draws the diagonal strike.) Only genuine momenta (q/k/p with a
// Unicode-subscript index) trigger the slash — a gamma contracted with a
// polarization ϵ keeps its explicit γ^μ. This is the common adjacent-propagator
// case (the `(m + p̸)` numerator of an internal fermion line); anything that does
// not match is left as-is.

// A momentum token: q/k/p with one or more Unicode-subscript digits (e.g. q₄, k₀).
const MOMENTUM = "[qkp][₀₁₂₃₄₅₆₇₈₉]+";

// `<mom>^(α_(X)) γ^(α_(X),<bispinors>)`, where the α_(X) is back-referenced so the
// momentum and the gamma must share the same dummy Minkowski index.
const SLASH = new RegExp(
  `(${MOMENTUM})\\^\\((α_\\([^)]*\\))\\)\\s*γ\\^\\(\\2,\\s*((?:b_\\([^)]*\\)\\s*)+)\\)`,
  "g",
);

export function slashMomenta(raw: string): string {
  return raw.replace(
    SLASH,
    (_match, momentum: string, _index: string, bispinors: string) =>
      `cancel(${momentum})^(${bispinors.trim()})`,
  );
}

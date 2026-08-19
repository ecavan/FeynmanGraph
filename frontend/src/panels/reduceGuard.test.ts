import { describe, expect, it } from "vitest";
import {
  clampForDisplay,
  reduceLoopGuard,
  reduceReasonMessage,
  sanitizeReducedTypst,
} from "./reduceGuard";

describe("reduceLoopGuard", () => {
  it("allows a one-loop diagram (no warning)", () => {
    expect(reduceLoopGuard(1)).toBeNull();
  });

  it("warns for a tree / zero-loop diagram", () => {
    const msg = reduceLoopGuard(0);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/one-loop/i);
    expect(msg).toMatch(/0 loops/);
  });

  it("warns for a multi-loop diagram, pluralising correctly", () => {
    const msg = reduceLoopGuard(2);
    expect(msg).toMatch(/one-loop/i);
    expect(msg).toMatch(/2 loops/);
  });
});

describe("reduceReasonMessage", () => {
  it("maps not_one_loop to a one-loop warning", () => {
    expect(reduceReasonMessage("not_one_loop")).toMatch(/one-loop/i);
  });

  it("maps zero_numerator to a 'vanishes' message", () => {
    expect(reduceReasonMessage("zero_numerator")).toMatch(/vanish/i);
  });

  it("maps unsupported to a 'not supported yet' message", () => {
    expect(reduceReasonMessage("unsupported")).toMatch(/support/i);
  });

  it("returns null for absent / unknown status", () => {
    expect(reduceReasonMessage(undefined)).toBeNull();
    expect(reduceReasonMessage(null)).toBeNull();
    expect(reduceReasonMessage("something-else")).toBeNull();
  });
});

describe("sanitizeReducedTypst", () => {
  it("subscripts master heads so Typst doesn't parse them as functions", () => {
    const out = sanitizeReducedTypst('B0(x; a, b)');
    expect(out).not.toMatch(/B0\(/);
    expect(out).toContain("B_0 (");
  });

  it("rewrites dot(a,b) to infix and subscripts flat momenta", () => {
    expect(sanitizeReducedTypst("dot(q1,q1)")).toBe("(q_(1) dot q_(1))");
  });

  it("handles A0/C0/D0 heads and multi-digit momenta", () => {
    expect(sanitizeReducedTypst("A0(m)")).toContain("A_0 (");
    expect(sanitizeReducedTypst("C0(x)")).toContain("C_0 (");
    expect(sanitizeReducedTypst("D0(x)")).toContain("D_0 (");
    expect(sanitizeReducedTypst("q12")).toBe("q_(12)");
  });

  it("leaves already-valid content (unicode subscripts, quoted couplings) untouched", () => {
    const s = '"MTA"² ϵ₀^(α_(¹))';
    expect(sanitizeReducedTypst(s)).toBe(s);
  });

  it("quotes residual bare identifiers (trace, massless mass, spinor indices)", () => {
    expect(sanitizeReducedTypst("Tr(x)")).toContain('"Tr"');
    expect(sanitizeReducedTypst("ZERO²")).toBe('"ZERO"²'); // ² word-boundary quirk
    expect(sanitizeReducedTypst("in out")).toBe('"in" "out"');
  });

  it("does not quote inside existing quoted strings or the dot operator", () => {
    expect(sanitizeReducedTypst('"GC_3"')).toBe('"GC_3"');
    expect(sanitizeReducedTypst("q1 dot q1")).toBe("q_(1) dot q_(1)");
  });
});

describe("clampForDisplay", () => {
  it("leaves short strings untouched", () => {
    expect(clampForDisplay("small", 40000)).toBe("small");
  });

  it("truncates large strings and reports the full length", () => {
    const big = "x".repeat(100000);
    const out = clampForDisplay(big, 40000);
    expect(out.length).toBeLessThan(big.length);
    expect(out).toMatch(/truncated/);
    expect(out).toContain("100,000");
  });
});

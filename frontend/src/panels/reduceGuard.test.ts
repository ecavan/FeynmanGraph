import { describe, expect, it } from "vitest";
import { reduceLoopGuard, reduceReasonMessage } from "./reduceGuard";

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

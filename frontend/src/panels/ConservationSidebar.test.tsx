import { describe, expect, it } from "vitest";
import { extractDeficits } from "./ConservationSidebar";

describe("extractDeficits", () => {
  it("parses charge/lepton/baryon/color deficits out of issue strings", () => {
    const issues = [
      { code: "CONSERVATION_CHARGE", detail: "Charge: deficit = -1", element_ids: [] },
      { code: "CONSERVATION_LEPTON", detail: "Lepton: deficit = 2", element_ids: [] },
      { code: "CONSERVATION_BARYON", detail: "Baryon: deficit = 0", element_ids: [] },
      { code: "CONSERVATION_COLOR", detail: "Color: deficit = 1", element_ids: [] },
    ];
    const d = extractDeficits(issues);
    expect(d.charge).toBe(-1);
    expect(d.lepton).toBe(2);
    expect(d.baryon).toBe(0);
    expect(d.color).toBe(1);
  });

  it("ignores non-conservation codes", () => {
    const d = extractDeficits([
      { code: "UNASSIGNED_EDGES", detail: "stuff", element_ids: [] },
    ]);
    expect(d).toEqual({});
  });

  it("prefers the structured `deficit` field over regex-parsing the detail", () => {
    // Server sends both; if they disagree, the structured field wins.
    const issues = [
      {
        code: "CONSERVATION_CHARGE",
        detail: "Charge does not conserve: deficit = -1",
        element_ids: [],
        deficit: -2,  // disagrees with detail; this should win
      },
    ];
    const d = extractDeficits(issues);
    expect(d.charge).toBe(-2);
  });

  it("falls back to regex when `deficit` is absent (back-compat)", () => {
    const issues = [
      {
        code: "CONSERVATION_LEPTON",
        detail: "Lepton number does not conserve: deficit = 3",
        element_ids: [],
      },
    ];
    const d = extractDeficits(issues);
    expect(d.lepton).toBe(3);
  });
});

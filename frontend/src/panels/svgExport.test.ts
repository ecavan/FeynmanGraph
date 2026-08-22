import { describe, expect, it } from "vitest";

import { svgSize } from "./svgExport";

describe("svgSize", () => {
  it("reads explicit width/height attributes (with pt units)", () => {
    const svg =
      '<svg width="240.5pt" height="60pt" viewBox="0 0 240 60"></svg>';
    expect(svgSize(svg)).toEqual({ width: 241, height: 60 });
  });

  it("falls back to the viewBox when width/height are absent", () => {
    const svg =
      '<svg viewBox="0 0 320 88" xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(svgSize(svg)).toEqual({ width: 320, height: 88 });
  });

  it("falls back to a sane default when nothing is parseable", () => {
    expect(svgSize("<svg></svg>")).toEqual({ width: 800, height: 200 });
  });
});

import { describe, expect, it } from "vitest";
import { diagramBounds } from "./exportImage";

describe("diagramBounds", () => {
  it("returns a unit box for an empty diagram", () => {
    expect(diagramBounds([], 10)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("spans all nodes plus the node footprint and padding", () => {
    const b = diagramBounds(
      [
        { id: "a", position: [0, 0] },
        { id: "b", position: [100, 50] },
      ],
      10,
    );
    expect(b.x).toBe(-10);
    expect(b.y).toBe(-10);
    expect(b.width).toBe(136); // (100 + 16 + 10) - (-10)
    expect(b.height).toBe(86); // (50 + 16 + 10) - (-10)
  });

  it("handles negative coordinates (external legs sit at -260)", () => {
    const b = diagramBounds(
      [
        { id: "in", position: [-260, 0] },
        { id: "out", position: [260, 0] },
      ],
      0,
    );
    expect(b.x).toBe(-260);
    expect(b.width).toBe(536); // (260 + 16) - (-260)
  });
});

import { toPng, toSvg } from "html-to-image";
import type { VertexNode } from "../state/diagram";

const NODE_FOOTPRINT = 16;
const DEFAULT_PAD = 48;

export type Bounds = { x: number; y: number; width: number; height: number };

// Bounding box of the diagram in flow coordinates, padded so edge labels and
// arrowheads (which sit just outside the node centers) aren't clipped.
export function diagramBounds(nodes: VertexNode[], pad = DEFAULT_PAD): Bounds {
  if (nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  const xs = nodes.map((n) => n.position[0]);
  const ys = nodes.map((n) => n.position[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + NODE_FOOTPRINT + pad;
  const maxY = Math.max(...ys) + NODE_FOOTPRINT + pad;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Render the React Flow viewport (edges + nodes) to an image fitted to the whole
// diagram on a white background, and trigger a download.
export async function exportDiagramImage(
  format: "png" | "svg",
  nodes: VertexNode[],
  filename: string,
): Promise<void> {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("diagram canvas not found");

  const b = diagramBounds(nodes);
  const render = format === "png" ? toPng : toSvg;
  const dataUrl = await render(viewport, {
    backgroundColor: "#ffffff",
    width: b.width,
    height: b.height,
    style: {
      width: `${b.width}px`,
      height: `${b.height}px`,
      transform: `translate(${-b.x}px, ${-b.y}px)`,
    },
  });

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${filename}.${format}`;
  a.click();
}

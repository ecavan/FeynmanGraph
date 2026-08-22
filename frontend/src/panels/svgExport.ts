// Export a rendered Typst SVG (the numerator or its reduction) as a standalone
// SVG or a rasterized PNG, so the closed-form result can go straight into a
// paper or slide alongside the diagram.

/** Pixel size of an SVG string: explicit width/height, else viewBox, else a
 *  default. Units (pt/px) are stripped; values are rounded up. */
export function svgSize(svg: string): { width: number; height: number } {
  const w = /\bwidth="([\d.]+)/.exec(svg)?.[1];
  const h = /\bheight="([\d.]+)/.exec(svg)?.[1];
  if (w && h)
    return { width: Math.ceil(Number(w)), height: Math.ceil(Number(h)) };
  const vb = /viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(svg);
  if (vb)
    return {
      width: Math.ceil(Number(vb[1])),
      height: Math.ceil(Number(vb[2])),
    };
  return { width: 800, height: 200 };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download the SVG markup as a `.svg` file. */
export function downloadSvg(filename: string, svg: string): void {
  triggerDownload(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    `${filename}.svg`,
  );
}

/** Rasterize the SVG onto a white canvas at `scale`× and download a `.png`. */
export async function downloadPng(
  filename: string,
  svg: string,
  scale = 2,
): Promise<void> {
  const fallback = svgSize(svg);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("failed to load SVG for PNG export"));
    img.src = url;
  });
  // Prefer the browser's computed intrinsic size; fall back to parsing the SVG.
  const width = img.naturalWidth || fallback.width;
  const height = img.naturalHeight || fallback.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width * scale);
  canvas.height = Math.max(1, height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (blob) triggerDownload(blob, `${filename}.png`);
}

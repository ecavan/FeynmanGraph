// Save a string to a file the user downloads. The on-screen numerator/reduction
// is clamped for display (a 2.5 MB reduction can't render), so this hands back
// the FULL, untruncated expression for offline use / copy into other tools.
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

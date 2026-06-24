// After a redeploy the old hashed chunks are gone, so a lazy dynamic import can
// fail with "Failed to fetch dynamically imported module". Vite fires
// `vite:preloadError` in that case; reload once to pull the fresh index.html and
// chunks. This is a backstop to the `Cache-Control: no-cache` header the server
// sets on index.html.
export function installStaleChunkReload(
  reload: () => void = () => window.location.reload(),
): void {
  window.addEventListener("vite:preloadError", () => reload());
}

import { expect, test } from "@playwright/test";

/**
 * Walkthrough: app boots, auto-loads the ee_mumu starter, conservation
 * sidebar shows balanced quantum numbers, exporting yields a well-formed
 * gammaloop .dot string.
 *
 * Requires:
 *  - frontend dev server running (Playwright handles via webServer config)
 *  - backend `feyngraph serve` running on :8000 separately (the Vite proxy
 *    forwards /api/* to it)
 */
test("ee_mumu starter loads, exports clean .dot", async ({ page }) => {
  // Clear localStorage so the auto-load (not the restored session) takes effect
  await page.addInitScript(() => localStorage.clear());

  await page.goto("/");

  // Auto-load fires on mount. Switch to canvas, expect Issues panel to be clean.
  await page.getByRole("button", { name: /^canvas$/i }).click();
  await expect(page.getByText(/no issues/i)).toBeVisible({ timeout: 8000 });

  // Boundary balance: all four quantities should be zero (green check marks).
  const sidebar = page.locator("aside");
  await expect(sidebar.getByText(/charge/i)).toBeVisible();
  await expect(sidebar.getByText(/OK/).first()).toBeVisible();

  // Switch to Export, click Export .dot, verify output
  await page.getByRole("button", { name: /^export$/i }).click();
  await page.getByRole("button", { name: /^export \.dot$/i }).click();
  const pre = page.locator("pre");
  await expect(pre).toContainText("digraph ee_mumu", { timeout: 5000 });
  await expect(pre).toContainText("pdg=11");
  await expect(pre).toContainText("pdg=13");
  await expect(pre).toContainText("pdg=22");
});

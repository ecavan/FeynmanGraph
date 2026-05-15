// Verify the Loop momentum routing panel appears for loop diagrams + allows override.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = join(ROOT, "docs", "eli", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.FEYNGRAPH_URL ?? "http://localhost:8765";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const issues = [];
page.on("pageerror", (e) => issues.push({ kind: "pageerror", message: String(e) }));
page.on("console", (m) => { if (m.type() === "error") issues.push({ kind: "consoleerror", text: m.text() }); });

await page.addInitScript(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Load gg_H (1-loop) so the routing panel appears
await page.getByRole("button", { name: /^setup$/i }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Load: gg_H/i }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: join(SHOTS, "12-canvas-gg_H-with-routing.png"), fullPage: true });

const routingHeading = await page.locator("text=Loop momentum routing").count();
console.log(`[lmb] panel visible: ${routingHeading > 0}`);
if (routingHeading === 0) issues.push({ kind: "routing_panel_missing" });

// Apply an override: pick e5 as the chord
const input = page.locator('input[placeholder*="edge IDs"]');
await input.fill("e5");
await page.getByRole("button", { name: /^Apply$/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(SHOTS, "13-routing-after-override.png"), fullPage: true });

const overrideMarker = await page.locator("text=user override").count();
console.log(`[lmb] override marker shown: ${overrideMarker > 0}`);
if (overrideMarker === 0) issues.push({ kind: "override_marker_missing" });

// Try an INVALID override — non-existent edge
await input.fill("bogus_edge");
await page.getByRole("button", { name: /^Apply$/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(SHOTS, "14-routing-invalid.png"), fullPage: true });

const errorMsg = await page.locator("p[style*='red']").last().textContent().catch(() => null);
console.log(`[lmb] error message on invalid override: ${errorMsg?.slice(0, 80)}`);

// Reset
await page.getByRole("button", { name: /^Reset$/ }).click().catch(() => {});
await page.waitForTimeout(1000);

// Now go to ee_mumu (tree-level) and verify the panel is HIDDEN
await page.getByRole("button", { name: /^setup$/i }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Load: ee_mumu/i }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: join(SHOTS, "15-canvas-ee_mumu-no-routing.png"), fullPage: true });

const routingHidden = await page.locator("text=Loop momentum routing").count();
console.log(`[lmb] panel hidden for tree-level: ${routingHidden === 0}`);
if (routingHidden > 0) issues.push({ kind: "routing_panel_shown_for_tree" });

await browser.close();
console.log(`[lmb] ${issues.length} issues:`);
for (const i of issues) console.log(JSON.stringify(i));
process.exit(issues.length === 0 ? 0 : 1);

// Exploratory driver: probe edges of the new UI to surface live bugs.
//   - Empty diagram after Clear (no errors?)
//   - Theory switching while a diagram is loaded
//   - Self-loop (From == To)
//   - Build a custom diagram + export, inspect the dot
//   - LoopRoutingPanel with an invalid override
//   - Persistence: reload after edits

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = join(ROOT, "docs", "eli", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.FEYNGRAPH_URL ?? "http://localhost:8765";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

const findings = [];
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`[console] ${m.text()}`); });

await page.addInitScript(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ─── PROBE 1: Empty diagram ─────────────────────────────────
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(500);
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(500);
const emptyNodes = await page.locator(".react-flow__node").count();
const emptyIssues = await page.locator('[data-testid="issues-panel"]').textContent();
console.log(`[probe1] empty canvas: nodes=${emptyNodes}, issues panel text="${emptyIssues?.slice(0, 60)}"`);
if (emptyNodes !== 0) findings.push("Clear left nodes behind");
// Empty diagram = no issues? Or some issue (no external legs)?
await page.screenshot({ path: join(SHOTS, "explore-01-empty.png"), fullPage: true });

// ─── PROBE 2: Self-loop on single vertex ────────────────────
await page.getByTestId("add-vertex").click();
await page.waitForTimeout(400);
const ids1 = await page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((el) => el.getAttribute("data-id")),
);
console.log(`[probe2] single vertex: ${JSON.stringify(ids1)}`);
await page.getByTestId("add-particle").click();
await page.waitForTimeout(200);
// Both From and To = the same vertex
const fromSelect = page.locator('[data-testid="add-particle-form"] select').first();
const toSelect = page.locator('[data-testid="add-particle-form"] select').nth(1);
await fromSelect.selectOption(ids1[0]);
await toSelect.selectOption(ids1[0]);
await page.waitForTimeout(150);
// Check the tadpole-hint appears
const tadpoleHint = await page.locator('[data-testid="add-particle-form"]').getByText(/tadpole/i).count();
console.log(`[probe2] tadpole hint visible: ${tadpoleHint > 0}`);
if (tadpoleHint === 0) findings.push("Tadpole hint missing when From=To");
// Submit and verify edge created
await page.getByRole("button", { name: /^Add particle$/ }).click();
await page.waitForTimeout(600);
const selfLoopEdges = await page.locator(".react-flow__edge").count();
console.log(`[probe2] edges after self-loop submit: ${selfLoopEdges}`);
if (selfLoopEdges !== 1) findings.push(`Self-loop did not create edge (got ${selfLoopEdges})`);
await page.screenshot({ path: join(SHOTS, "explore-02-self-loop.png"), fullPage: true });

// ─── PROBE 3: Theory switching while a diagram is loaded ────
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^setup$/i }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Load: gg_H/i }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(1000);
const beforeSwitch = await page.locator(".react-flow__edge").count();
console.log(`[probe3] gg_H loaded: edges=${beforeSwitch}`);
// Switch theory to QED — gg_H is invalid under QED (gluons + Higgs not in QED)
const theorySelect = page.locator('[data-testid="toolbox"] select').first();
await theorySelect.selectOption("qed");
await page.waitForTimeout(1200);
const afterSwitch = await page.locator(".react-flow__edge").count();
const issuesAfterSwitch = await page.locator('[data-testid="issues-panel"]').textContent();
console.log(`[probe3] after switch to QED: edges=${afterSwitch}, issues text="${issuesAfterSwitch?.slice(0, 80)}"`);
await page.screenshot({ path: join(SHOTS, "explore-03-theory-switch.png"), fullPage: true });

// ─── PROBE 4: Export tab on the gg_H diagram ────────────────
await theorySelect.selectOption("sm");  // back to SM
await page.waitForTimeout(900);
await page.getByRole("button", { name: /^export$/i }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: join(SHOTS, "explore-04-export-tab.png"), fullPage: true });
const exportText = await page.locator('body').textContent();
const hasWarnings = exportText?.toLowerCase().includes("warning") ?? false;
const hasDigraph = exportText?.includes("digraph") ?? false;
console.log(`[probe4] export visible: digraph=${hasDigraph}, warnings_label=${hasWarnings}`);
if (!hasDigraph) findings.push("Export view doesn't show the .dot text");

// ─── PROBE 5: Invalid loop momentum override ────────────────
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(500);
const lmbInput = page.locator('input[placeholder*="edge IDs"]');
await lmbInput.fill("bogus");
await page.getByRole("button", { name: /^Apply$/ }).click();
await page.waitForTimeout(1000);
const lmbErr = await page.locator(".react-flow").locator("..").locator("..").locator("..").locator("text=/unknown edge ids/i").count();
console.log(`[probe5] invalid lmb error visible: ${lmbErr > 0}`);
// Check issues panel also picks it up (regression we fixed earlier)
const issuesNowText = await page.locator('[data-testid="issues-panel"]').textContent();
const issuesHasOverride = issuesNowText?.includes("INVALID_LMB_OVERRIDE") ?? false;
console.log(`[probe5] IssuesPanel shows INVALID_LMB_OVERRIDE: ${issuesHasOverride}`);
if (!issuesHasOverride) findings.push("IssuesPanel doesn't surface INVALID_LMB_OVERRIDE on Apply");
await page.screenshot({ path: join(SHOTS, "explore-05-invalid-lmb.png"), fullPage: true });

// Reset routing
await page.getByRole("button", { name: /^Reset$/ }).click().catch(() => {});
await page.waitForTimeout(500);

// ─── PROBE 6: Persistence ───────────────────────────────────
// Reload the page and check that gg_H is still loaded (from localStorage)
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const restoredEdges = await page.locator(".react-flow__edge").count();
const restoredNodes = await page.locator(".react-flow__node").count();
console.log(`[probe6] after reload: nodes=${restoredNodes}, edges=${restoredEdges}`);
if (restoredEdges === 0 && restoredNodes === 0) findings.push("Persistence lost the diagram on reload");
await page.screenshot({ path: join(SHOTS, "explore-06-after-reload.png"), fullPage: true });

// ─── PROBE 7: Build a real 2→2 diagram from scratch and export ──
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(300);
for (let i = 0; i < 4; i++) {
  await page.getByTestId("add-vertex").click();
  await page.waitForTimeout(200);
}
const buildIds = await page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((el) => el.getAttribute("data-id")),
);
console.log(`[probe7] built 4 vertices: ${JSON.stringify(buildIds)}`);
// Mark roles
const roles = ["Incoming", "Incoming", "Outgoing", "Outgoing"];
for (let i = 0; i < 4; i++) {
  await page.click(`.react-flow__node[data-id="${buildIds[i]}"]`);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: new RegExp(`^${roles[i]}$`) }).click();
  await page.waitForTimeout(300);
}
// Add 4 edges via the form: in0→v_internal? Actually with 4 vertices all external, we need an internal vertex
// Skip that complexity — just try to export the legs-only diagram
await page.getByRole("button", { name: /^export$/i }).click();
await page.waitForTimeout(1200);
const exportText2 = await page.locator('body').textContent();
const hasError = exportText2?.toLowerCase().includes("error") ?? false;
const dotMatch = exportText2?.match(/digraph[^{]*\{/) ?? null;
console.log(`[probe7] export of legs-only diagram: error_shown=${hasError}, has_dot=${dotMatch ? "yes" : "no"}`);
await page.screenshot({ path: join(SHOTS, "explore-07-build-and-export.png"), fullPage: true });

await browser.close();

console.log("\n=== Findings ===");
console.log(`Page errors: ${pageErrors.length}`);
for (const e of pageErrors) console.log("  -", e);
console.log(`Functional issues: ${findings.length}`);
for (const f of findings) console.log("  -", f);
process.exit(pageErrors.length === 0 && findings.length === 0 ? 0 : 1);

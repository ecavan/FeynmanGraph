// Visual verification for the redesigned editor:
//   - 4 tabs: Canvas / Setup / Import / Export
//   - Button-driven editor (no drag/drop)
//   - Force-directed layout on every change
//   - HEP-style edges with FeynmanAPI palette
//   - Particle palette filtered to common particles, with symbol labels (γ, g, W±, …)

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

const issues = [];
page.on("pageerror", (e) => issues.push({ kind: "pageerror", message: String(e) }));
page.on("console", (m) => { if (m.type() === "error") issues.push({ kind: "consoleerror", text: m.text() }); });

await page.addInitScript(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// 1) Canvas tab with default ee_mumu loaded — first impression
await page.screenshot({ path: join(SHOTS, "v3-01-default-ee_mumu.png"), fullPage: true });

// 2) Setup tab — model picker + starters live here now
await page.getByRole("button", { name: /^setup$/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(SHOTS, "v3-02-setup-tab.png"), fullPage: true });

// 2b) Canvas tab — TheoryPicker lives here now. Verify 4 theories show.
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(400);
const ewVisible = await page.locator('[data-testid="toolbox"] option[value="electroweak"]').count();
console.log(`[v3] electroweak option in Canvas theory picker: ${ewVisible > 0}`);
if (ewVisible === 0) issues.push({ kind: "electroweak_missing" });

// 3) Import tab
await page.getByRole("button", { name: /^import$/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(SHOTS, "v3-03-import-tab.png"), fullPage: true });
const uploaderText = await page.locator('text=/Import a UFO model/').count();
if (uploaderText === 0) issues.push({ kind: "uploader_missing" });

// 4) Go back to setup, load gg_H starter (loop diagram, lots of edges types)
await page.getByRole("button", { name: /^setup$/i }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Load: gg_H/i }).click();
await page.waitForTimeout(700);

// 5) Switch to canvas — should be auto-laid-out 1-loop diagram
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(SHOTS, "v3-04-canvas-gg_H-relayouted.png"), fullPage: true });

// 6) Build from scratch: Clear, then add vertices via button, then add particles
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(400);
const empty = await page.locator(".react-flow__node").count();
console.log(`[v3] cleared, nodes: ${empty}`);
if (empty !== 0) issues.push({ kind: "clear_failed" });

// Add 4 vertices via the button
for (let i = 0; i < 4; i++) {
  await page.getByTestId("add-vertex").click();
  await page.waitForTimeout(150);
}
const nVerts = await page.locator(".react-flow__node").count();
console.log(`[v3] vertices after 4 add-vertex clicks: ${nVerts}`);
if (nVerts !== 4) issues.push({ kind: "wrong_vertex_count", got: nVerts });
await page.screenshot({ path: join(SHOTS, "v3-05-four-vertices-button-driven.png"), fullPage: true });

// Tag first two as incoming, last two as outgoing
const ids = await page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((el) => el.getAttribute("data-id")),
);
console.log(`[v3] ids: ${JSON.stringify(ids)}`);
for (let i = 0; i < 4; i++) {
  await page.click(`.react-flow__node[data-id="${ids[i]}"]`);
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: new RegExp(`^${i < 2 ? "Incoming" : "Outgoing"}$`) }).click();
  await page.waitForTimeout(450);
}
await page.waitForTimeout(600);
await page.screenshot({ path: join(SHOTS, "v3-06-legs-marked-via-buttons.png"), fullPage: true });

// Open the "+ Add particle" form and try to add an edge
await page.getByTestId("add-particle").click();
await page.waitForTimeout(300);
const formVisible = await page.getByTestId("add-particle-form").count();
console.log(`[v3] add-particle form visible: ${formVisible > 0}`);
if (formVisible === 0) issues.push({ kind: "add_particle_form_missing" });
await page.screenshot({ path: join(SHOTS, "v3-07-add-particle-form-open.png"), fullPage: true });

// Pick From=ids[0], To=ids[2] from dropdowns, Particle=22 (photon)
const fromSelect = page.locator('[data-testid="add-particle-form"] select').first();
const toSelect = page.locator('[data-testid="add-particle-form"] select').nth(1);
const particleSelect = page.locator('[data-testid="add-particle-form"] select').nth(2);
await fromSelect.selectOption(ids[0]);
await toSelect.selectOption(ids[2]);
await particleSelect.selectOption("22");
await page.getByRole("button", { name: /^Add particle$/ }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: join(SHOTS, "v3-08-after-add-particle.png"), fullPage: true });
const edgeCount = await page.locator(".react-flow__edge").count();
console.log(`[v3] edges after add-particle: ${edgeCount}`);
if (edgeCount !== 1) issues.push({ kind: "edge_not_created", got: edgeCount });

// Verify particle palette is filtered (should NOT have ghosts/Goldstones by default)
const ghostInPalette = await page.locator('[data-testid="toolbox"]').getByText(/^ghA$/, { exact: false }).count();
console.log(`[v3] ghost (ghA) in default palette: ${ghostInPalette}`);
if (ghostInPalette > 0) issues.push({ kind: "ghost_visible_default" });
// And SHOULD contain γ
const gammaInPalette = await page.locator('[data-testid="toolbox"]').getByText("γ").count();
console.log(`[v3] photon symbol γ in palette: ${gammaInPalette}`);
if (gammaInPalette === 0) issues.push({ kind: "photon_symbol_missing" });

// 7) Switch theory to QED and confirm the palette no longer includes the gluon.
const theorySelect = page.locator('[data-testid="toolbox"] select').first();
await theorySelect.selectOption("qed");
await page.waitForTimeout(900);
const gluonAfterQED = await page.locator('[data-testid="toolbox"]').getByText("g", { exact: true }).count();
console.log(`[v3] gluon "g" in palette after switching to QED: ${gluonAfterQED}`);
if (gluonAfterQED !== 0) issues.push({ kind: "qed_palette_has_gluon", got: gluonAfterQED });
const gammaAfterQED = await page.locator('[data-testid="toolbox"]').getByText("γ").count();
if (gammaAfterQED === 0) issues.push({ kind: "qed_palette_missing_photon" });
await page.screenshot({ path: join(SHOTS, "v3-09-qed-palette.png"), fullPage: true });

await browser.close();
console.log(`[v3] ${issues.length} issues`);
for (const i of issues) console.log("  -", JSON.stringify(i));
process.exit(issues.length === 0 ? 0 : 1);

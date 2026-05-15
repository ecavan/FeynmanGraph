// E2E: undo/redo + new toolbar layout + VERTEX_NOT_IN_MODEL check
//   - Undo / Redo buttons render at top of toolbox
//   - Both disabled initially; undo activates after adding a vertex
//   - + Add particle is DISABLED with 1 vertex; ENABLES with 2
//   - Cmd/Ctrl+Z works via keyboard
//   - Building a 4-electron vertex surfaces VERTEX_NOT_IN_MODEL

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
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

await page.addInitScript(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(400);
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(400);

// At start: undo + redo disabled, add particle disabled
const undoDisabled = await page.getByTestId("undo").isDisabled();
const redoDisabled = await page.getByTestId("redo").isDisabled();
const addParticleDisabled = await page.getByTestId("add-particle").isDisabled();
console.log(`[undo] start: undo_disabled=${undoDisabled}, redo_disabled=${redoDisabled}, addP_disabled=${addParticleDisabled}`);
if (!undoDisabled) errors.push("undo button should be disabled at start");
if (!redoDisabled) errors.push("redo button should be disabled at start");
if (!addParticleDisabled) errors.push("add-particle should be disabled with 0 vertices");
await page.screenshot({ path: join(SHOTS, "undo-01-empty.png"), fullPage: true });

// Add 1 vertex: add-particle still disabled, undo enabled
await page.getByTestId("add-vertex").click();
await page.waitForTimeout(500);
const addPStillDisabled = await page.getByTestId("add-particle").isDisabled();
console.log(`[undo] 1 vertex: addP_disabled=${addPStillDisabled}`);
if (!addPStillDisabled) errors.push("add-particle should still be disabled with 1 vertex");

// Add 2nd vertex: now add-particle should be enabled
await page.getByTestId("add-vertex").click();
await page.waitForTimeout(500);
const addPEnabled = !(await page.getByTestId("add-particle").isDisabled());
console.log(`[undo] 2 vertices: addP_enabled=${addPEnabled}`);
if (!addPEnabled) errors.push("add-particle should be enabled with 2 vertices");
await page.screenshot({ path: join(SHOTS, "undo-02-two-vertices.png"), fullPage: true });

// Undo: should remove the second vertex
await page.getByTestId("undo").click();
await page.waitForTimeout(500);
const afterUndo = await page.locator(".react-flow__node").count();
console.log(`[undo] after 1 undo: nodes=${afterUndo}`);
if (afterUndo !== 1) errors.push(`expected 1 node after undo, got ${afterUndo}`);

// Redo: should bring it back
await page.getByTestId("redo").click();
await page.waitForTimeout(500);
const afterRedo = await page.locator(".react-flow__node").count();
console.log(`[undo] after redo: nodes=${afterRedo}`);
if (afterRedo !== 2) errors.push(`expected 2 nodes after redo, got ${afterRedo}`);

// Cmd/Ctrl+Z keyboard shortcut
const modifier = process.platform === "darwin" ? "Meta" : "Control";
await page.keyboard.press(`${modifier}+z`);
await page.waitForTimeout(500);
const afterKbd = await page.locator(".react-flow__node").count();
console.log(`[undo] after ${modifier}+Z: nodes=${afterKbd}`);
if (afterKbd !== 1) errors.push(`expected 1 node after keyboard undo, got ${afterKbd}`);

// Build a 4-electron vertex (4 externals + 1 internal) to trip VERTEX_NOT_IN_MODEL
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(400);
for (let i = 0; i < 5; i++) {
  await page.getByTestId("add-vertex").click();
  await page.waitForTimeout(200);
}
const ids = await page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((el) => el.getAttribute("data-id")),
);
console.log(`[unphys] vertex ids: ${JSON.stringify(ids)}`);
// Mark 2 in, 2 out
const roles = ["Incoming", "Incoming", "Outgoing", "Outgoing"];
for (let i = 0; i < 4; i++) {
  await page.click(`.react-flow__node[data-id="${ids[i]}"]`);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: new RegExp(`^${roles[i]}$`) }).click();
  await page.waitForTimeout(300);
}
// Add 4 electron edges all meeting at v5 (the internal)
async function addParticle(from, to, pdg) {
  await page.getByTestId("add-particle").click();
  await page.waitForTimeout(200);
  const fromSel = page.locator('[data-testid="add-particle-form"] select').first();
  const toSel = page.locator('[data-testid="add-particle-form"] select').nth(1);
  const partSel = page.locator('[data-testid="add-particle-form"] select').nth(2);
  await fromSel.selectOption(from);
  await toSel.selectOption(to);
  await partSel.selectOption(String(pdg));
  await page.getByRole("button", { name: /^Add particle$/ }).click();
  await page.waitForTimeout(500);
}
// e- e- → e- e- via one vertex: 2 incoming e- (pdg 11), 2 outgoing e- (pdg 11)
// Conservation passes but 4-electron-at-one-point is not a SM Feynman rule.
await addParticle(ids[0], ids[4], 11);
await addParticle(ids[1], ids[4], 11);
await addParticle(ids[4], ids[2], 11);
await addParticle(ids[4], ids[3], 11);
// Switch theory to SM so the model has fermion vertices
const theorySelect = page.locator('[data-testid="toolbox"] select').first();
await theorySelect.selectOption("sm");
await page.waitForTimeout(900);
await page.screenshot({ path: join(SHOTS, "undo-03-4e-vertex.png"), fullPage: true });

const issuesText = await page.locator('[data-testid="issues-panel"]').textContent();
console.log(`[unphys] issues text: ${issuesText?.slice(0, 150)}`);
const hasVertexNotInModel = issuesText?.includes("VERTEX_NOT_IN_MODEL") ?? false;
console.log(`[unphys] VERTEX_NOT_IN_MODEL flagged: ${hasVertexNotInModel}`);
if (!hasVertexNotInModel) errors.push("4-electron vertex should trip VERTEX_NOT_IN_MODEL");

await browser.close();
console.log(`\n[summary] ${errors.length} errors`);
for (const e of errors) console.log("  -", e);
process.exit(errors.length === 0 ? 0 : 1);

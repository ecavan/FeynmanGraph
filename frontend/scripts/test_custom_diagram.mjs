// Build a custom diagram from scratch using the editor:
//   1. Clear the auto-loaded ee_mumu starter
//   2. Drop 4 vertices via drag from the toolbox
//   3. Click each, toggle role (incoming/incoming/outgoing/outgoing)
//   4. Click delete on one
//   5. Verify counts at each step
//
// Edge drawing via mouse-from-handle is fiddly (the react-flow Handles are
// 0.01 opacity by design — clickable area is tiny). The store has unit-test
// coverage for addEdge so this driver focuses on the UX surface only.

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
await page.waitForTimeout(1200);

// The default Canvas view should be active.
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(600);

// Clear the auto-loaded starter so we start blank.
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(400);
let n = await page.locator(".react-flow__node").count();
console.log(`[custom] after clear, nodes: ${n}`);
if (n !== 0) issues.push({ kind: "clear_did_not_empty", got: n });
await page.screenshot({ path: join(SHOTS, "custom-00-empty-canvas.png"), fullPage: true });

async function dropVertexAt(canvasX, canvasY) {
  const handle = page.getByTestId("new-vertex-drag-handle");
  const box = await page.locator(".react-flow").boundingBox();
  if (!box) throw new Error("react-flow canvas not found");
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(box.x + canvasX, box.y + canvasY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(180);
}

await dropVertexAt(220, 220);
await dropVertexAt(220, 480);
await dropVertexAt(720, 220);
await dropVertexAt(720, 480);
n = await page.locator(".react-flow__node").count();
console.log(`[custom] vertices after 4 drops: ${n}`);
if (n !== 4) issues.push({ kind: "wrong_drop_count", got: n });
await page.screenshot({ path: join(SHOTS, "custom-01-four-vertices.png"), fullPage: true });

// Read the ids so we can target each
const ids = await page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((el) => el.getAttribute("data-id")),
);
console.log(`[custom] ids: ${JSON.stringify(ids)}`);

// Mark first two as incoming, last two as outgoing
const roles = ["Incoming", "Incoming", "Outgoing", "Outgoing"];
for (let i = 0; i < 4; i++) {
  await page.click(`.react-flow__node[data-id="${ids[i]}"]`);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: new RegExp(`^${roles[i]}$`) }).click();
  await page.waitForTimeout(200);
}
await page.screenshot({ path: join(SHOTS, "custom-02-legs-marked.png"), fullPage: true });

// Inspect the visible leg badges (the ExternalLegNode renders "(incoming)" etc.)
const inN = await page.locator(".react-flow__node:has-text('(incoming)')").count();
const outN = await page.locator(".react-flow__node:has-text('(outgoing)')").count();
console.log(`[custom] visible legs — incoming: ${inN}, outgoing: ${outN}`);
if (inN !== 2 || outN !== 2) issues.push({ kind: "wrong_leg_counts", in: inN, out: outN });

// Cycle role: click the first vertex (currently incoming), hit "Cycle role" — should go to outgoing.
await page.click(`.react-flow__node[data-id="${ids[0]}"]`);
await page.waitForTimeout(200);
await page.getByRole("button", { name: /^Cycle role$/ }).click();
await page.waitForTimeout(200);
const afterCycle = await page.locator(".react-flow__node:has-text('(incoming)')").count();
console.log(`[custom] incoming after cycle: ${afterCycle}`);
if (afterCycle !== 1) issues.push({ kind: "cycle_did_not_decrease_incoming", got: afterCycle });

// Delete one vertex via the SelectionPanel
await page.click(`.react-flow__node[data-id="${ids[3]}"]`);
await page.waitForTimeout(200);
await page.getByRole("button", { name: /^Delete vertex$/ }).click();
await page.waitForTimeout(300);
const afterDelete = await page.locator(".react-flow__node").count();
console.log(`[custom] nodes after delete: ${afterDelete}`);
if (afterDelete !== 3) issues.push({ kind: "delete_failed", got: afterDelete });
await page.screenshot({ path: join(SHOTS, "custom-03-after-delete.png"), fullPage: true });

// Verify the particle palette shows familiar SM symbols
const gluonOk = await page.locator('[data-testid="toolbox"]').getByText(/^g$/, { exact: true }).count();
const photonOk = await page.locator('[data-testid="toolbox"]').getByText(/^a$/, { exact: true }).count();
const higgsOk = await page.locator('[data-testid="toolbox"]').getByText(/^H$/, { exact: true }).count();
console.log(`[custom] palette g: ${gluonOk}, a: ${photonOk}, H: ${higgsOk}`);
if (gluonOk === 0) issues.push({ kind: "palette_missing_gluon" });
if (photonOk === 0) issues.push({ kind: "palette_missing_photon" });

// Now load a starter to verify the new edge styling renders without errors
await page.getByRole("button", { name: /^settings$/i }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Load: gg_H/i }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(SHOTS, "custom-04-gg_H-styled.png"), fullPage: true });

await browser.close();
console.log(`[custom] ${issues.length} issues`);
for (const i of issues) console.log("  -", JSON.stringify(i));
process.exit(issues.length === 0 ? 0 : 1);

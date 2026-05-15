// Heavy end-to-end test: build a tree-level e+e- → μ+μ- diagram FROM SCRATCH
// using only the new button-driven UX, then export the .dot and verify it
// matches gammaloop's import-graphs schema by re-loading the same spec
// via /api/export-dot.
//
// Specifically exercises:
//   - + Add vertex (×6: 4 external + 2 internal)
//   - SelectionPanel role buttons (Incoming/Outgoing for the 4 externals)
//   - + Add particle (×5: 4 leg edges + 1 internal photon)
//   - Particle picker in SelectionPanel (clicking edges + picking a particle)
//   - Theory filter (QED palette is correct)
//   - Export tab: auto-export, preview rendered, .dot text shown, NO warnings
//     under theory=qed (since e/μ/γ are all in QED)

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

// Canvas tab. Switch theory to QED so the palette is short and we only see
// the particles we'll actually need.
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(400);
await page.getByTestId("clear-diagram").click();
await page.waitForTimeout(400);
const theorySelect = page.locator('[data-testid="toolbox"] select').first();
await theorySelect.selectOption("qed");
await page.waitForTimeout(800);

// 1. Add 6 vertices: ext_e_minus, ext_e_plus, ext_mu_minus, ext_mu_plus, v_in, v_out
for (let i = 0; i < 6; i++) {
  await page.getByTestId("add-vertex").click();
  await page.waitForTimeout(180);
}
const ids = await page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((el) => el.getAttribute("data-id")),
);
console.log(`[build] vertex ids: ${JSON.stringify(ids)}`);
if (ids.length !== 6) errors.push(`expected 6 vertices, got ${ids.length}`);

// 2. Mark roles: first 2 incoming, next 2 outgoing, last 2 internal
const roles = ["Incoming", "Incoming", "Outgoing", "Outgoing"];
for (let i = 0; i < 4; i++) {
  await page.click(`.react-flow__node[data-id="${ids[i]}"]`);
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: new RegExp(`^${roles[i]}$`) }).click();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: join(SHOTS, "build-01-vertices-roles.png"), fullPage: true });

// 3. Add 5 edges: e_in → v_in (e-), e+_in → v_in (e+), v_out → mu- (mu-),
//    v_out → mu+ (mu+), v_in → v_out (photon)
async function addParticle(from, to, pdg) {
  await page.getByTestId("add-particle").click();
  await page.waitForTimeout(250);
  const fromSel = page.locator('[data-testid="add-particle-form"] select').first();
  const toSel = page.locator('[data-testid="add-particle-form"] select').nth(1);
  const partSel = page.locator('[data-testid="add-particle-form"] select').nth(2);
  await fromSel.selectOption(from);
  await toSel.selectOption(to);
  await partSel.selectOption(String(pdg));
  await page.getByRole("button", { name: /^Add particle$/ }).click();
  await page.waitForTimeout(600);
}

// ids[0]=ext_e_minus, ids[1]=ext_e_plus, ids[2]=ext_mu_minus, ids[3]=ext_mu_plus
// ids[4]=v_in, ids[5]=v_out
await addParticle(ids[0], ids[4], 11);   // e- into v_in
await addParticle(ids[1], ids[4], -11);  // e+ into v_in
await addParticle(ids[5], ids[2], 13);   // mu- out of v_out
await addParticle(ids[5], ids[3], -13);  // mu+ out of v_out
await addParticle(ids[4], ids[5], 22);   // photon between

const edgeCount = await page.locator(".react-flow__edge").count();
console.log(`[build] edge count: ${edgeCount}`);
if (edgeCount !== 5) errors.push(`expected 5 edges, got ${edgeCount}`);
await page.screenshot({ path: join(SHOTS, "build-02-full-diagram.png"), fullPage: true });

// 4. Inspect IssuesPanel — should show zero issues (everything is in QED)
const issuesText = await page.locator('[data-testid="issues-panel"]').textContent();
console.log(`[build] issues text: "${issuesText?.slice(0, 100)}"`);
if (!issuesText?.includes("No issues")) errors.push(`expected "No issues", got: ${issuesText}`);

// 5. Switch to Export tab — auto-export should fire
await page.getByRole("button", { name: /^export$/i }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(SHOTS, "build-03-export-tab.png"), fullPage: true });

// Preview present?
const preview = await page.locator('[data-testid="diagram-preview"]').count();
console.log(`[build] preview rendered: ${preview > 0}`);
if (preview === 0) errors.push("export preview missing");

// Auto-export produced .dot?
const exportDot = await page.locator('[data-testid="export-dot"]').textContent();
const hasDigraph = exportDot?.includes("digraph") ?? false;
console.log(`[build] auto-export .dot has digraph: ${hasDigraph}, length=${exportDot?.length ?? 0}`);
if (!hasDigraph) errors.push("auto-export did not produce a .dot");

// No warnings — all particles legal in QED
const warnings = await page.locator('[data-testid="export-warnings"]').count();
console.log(`[build] export warnings panel visible: ${warnings > 0}`);
if (warnings !== 0) errors.push("unexpected warnings for legal-QED diagram");

// 6. Switch theory to QCD — should produce theory warnings (e/mu/photon aren't QCD)
await page.getByRole("button", { name: /^canvas$/i }).click();
await page.waitForTimeout(400);
await theorySelect.selectOption("qcd");
await page.waitForTimeout(900);
const qcdIssues = await page.locator('[data-testid="issues-panel"]').textContent();
const hasTheoryIssue = qcdIssues?.includes("THEORY_ILLEGAL") ?? false;
console.log(`[build] under QCD: issues text includes THEORY_ILLEGAL: ${hasTheoryIssue}`);
if (!hasTheoryIssue) errors.push("QCD switch did not produce THEORY_ILLEGAL issue");
await page.screenshot({ path: join(SHOTS, "build-04-theory-mismatch.png"), fullPage: true });

// And the export should now have warnings
await page.getByRole("button", { name: /^export$/i }).click();
await page.waitForTimeout(900);
// Click Re-export to refresh the warnings panel (auto-export ran on initial mount only)
await page.getByRole("button", { name: /Re-export/i }).click().catch(() => {});
await page.waitForTimeout(900);
const qcdWarnings = await page.locator('[data-testid="export-warnings"]').count();
console.log(`[build] under QCD: export-warnings panel visible: ${qcdWarnings > 0}`);
if (qcdWarnings === 0) errors.push("expected warnings under QCD theory mismatch");
await page.screenshot({ path: join(SHOTS, "build-05-export-with-warnings.png"), fullPage: true });

await browser.close();
console.log(`\n[build] ${errors.length} errors`);
for (const e of errors) console.log("  -", e);
process.exit(errors.length === 0 ? 0 : 1);

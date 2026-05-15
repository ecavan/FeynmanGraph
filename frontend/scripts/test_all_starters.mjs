// Load every starter through the UI; verify each one renders, validates, and exports.
//
// What this catches that manual_ui_drive.mjs misses:
//   - exercises ALL 8 starters, not a spot-check of 3
//   - asserts page/console errors === 0 across the full set
//   - asserts /api/validate-graph returns no error issues for each loaded spec
//   - asserts /api/export-dot returns a non-empty body for each loaded spec

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = join(ROOT, "docs", "eli", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.FEYNGRAPH_URL ?? "http://localhost:8765";

const examples = await (await fetch(`${BASE}/api/examples`)).json();
console.log(`[all] discovered ${examples.length} starters`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const issues = [];
page.on("pageerror", (e) => issues.push({ kind: "pageerror", message: String(e) }));
page.on("console", (m) => { if (m.type() === "error") issues.push({ kind: "consoleerror", text: m.text() }); });
page.on("requestfailed", (r) => issues.push({ kind: "reqfail", url: r.url(), err: r.failure()?.errorText }));

await page.addInitScript(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

let perStarter = [];

for (const ex of examples) {
  console.log(`\n[all] === ${ex.id} ===`);
  await page.getByRole("button", { name: /^settings$/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: new RegExp(`Load: ${ex.process_name.replace(/[+*?.()]/g, "\\$&")}`, "i") }).click();
  await page.waitForTimeout(800);

  // Switch to canvas tab and screenshot
  await page.getByRole("button", { name: /^canvas$/i }).click();
  await page.waitForTimeout(1500);
  const shot = join(SHOTS, `starter-${ex.id}.png`);
  await page.screenshot({ path: shot, fullPage: true });

  // Probe the API directly with the loaded store state by checking that
  // /api/validate-graph + /api/export-dot still work for this starter.
  const spec = await (await fetch(`${BASE}/api/examples/${ex.id}`)).json();
  const wireSpec = {
    model_id: spec.model_id,
    theory_id: spec.theory_id,
    process_name: spec.process_name,
    nodes: spec.nodes.map((n) => ({
      id: n.id,
      position: n.position,
      ufo_vertex_id: n.ufo_vertex_id ?? null,
    })),
    edges: spec.edges.map((e) => ({
      id: e.id,
      source_node_id: e.source_node_id,
      target_node_id: e.target_node_id,
      particle_pdg_id: e.particle_pdg_id,
    })),
    external_legs: spec.external_legs,
    lmb_edge_ids: null,
  };

  const validateRes = await fetch(`${BASE}/api/validate-graph`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wireSpec),
  });
  const validateBody = await validateRes.json();
  // GraphIssue has no `level` field — every entry is a blocking condition.
  const errIssues = validateBody.issues ?? [];

  const exportRes = await fetch(`${BASE}/api/export-dot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wireSpec),
  });
  const exportBody = await exportRes.json();

  const summary = {
    id: ex.id,
    loop_count: validateBody.loop_count,
    chord_edge_ids: validateBody.chord_edge_ids,
    err_issues: errIssues.length,
    export_ok: exportRes.status === 200 && (exportBody.dot ?? "").length > 0,
  };
  perStarter.push(summary);
  console.log(
    `[${ex.id}] loop=${summary.loop_count}` +
    ` chords=${JSON.stringify(summary.chord_edge_ids)}` +
    ` err_issues=${summary.err_issues}` +
    ` export_ok=${summary.export_ok}`,
  );

  if (summary.err_issues !== 0) issues.push({ kind: "validate_error", starter: ex.id, issues: errIssues });
  if (!summary.export_ok) issues.push({ kind: "export_failed", starter: ex.id, status: exportRes.status });
}

await browser.close();

console.log("\n[all] per-starter summary:");
for (const s of perStarter) console.log(`  ${s.id}: loop=${s.loop_count}, errs=${s.err_issues}, export=${s.export_ok}`);
console.log(`\n[all] ${issues.length} issues`);
for (const i of issues) console.log("  -", JSON.stringify(i));
process.exit(issues.length === 0 ? 0 : 1);

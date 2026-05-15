// Manual UI driver — connects to a running feyngraph server, screenshots each tab.
// Run with: cd frontend && node scripts/manual_ui_drive.mjs
// Requires playwright (installed via npm install @playwright/test).

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// script lives at <repo>/frontend/scripts/, so root is two levels up
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = join(ROOT, "docs", "eli", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.FEYNGRAPH_URL ?? "http://localhost:8765";

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();
  const issues = [];

  page.on("pageerror", (e) => {
    issues.push({ kind: "pageerror", message: String(e), stack: e.stack });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") issues.push({ kind: "consoleerror", text: msg.text() });
  });
  page.on("requestfailed", (req) => {
    issues.push({ kind: "requestfailed", url: req.url(), failure: req.failure()?.errorText });
  });

  console.log(`[drive] opening ${BASE}`);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000); // allow auto-load to fire
  await page.screenshot({ path: join(SHOTS, "01-canvas-on-load.png"), fullPage: true });

  console.log("[drive] settings tab");
  await page.getByRole("button", { name: /^setup$/i }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, "02-settings.png"), fullPage: true });

  console.log("[drive] picking SM model + qcd theory");
  await page.locator('input[type="radio"][name="model"]').nth(1).click().catch(() => {});
  await page.locator("select").selectOption("qcd").catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "03-settings-after-pick.png"), fullPage: true });

  console.log("[drive] loading qq_tt starter");
  await page.getByRole("button", { name: /Load: qq_tt/i }).click().catch((e) => {
    issues.push({ kind: "load_qq_tt_failed", message: String(e) });
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(SHOTS, "04-after-load-qq_tt.png"), fullPage: true });

  console.log("[drive] back to canvas");
  await page.getByRole("button", { name: /^canvas$/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, "05-canvas-qq_tt.png"), fullPage: true });

  console.log("[drive] export tab");
  await page.getByRole("button", { name: /^export$/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "06-export-empty.png"), fullPage: true });

  console.log("[drive] click Export .dot");
  await page.getByRole("button", { name: /^export \.dot$/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, "07-export-result.png"), fullPage: true });

  // Verify .dot output is in the DOM
  const dotText = await page.locator("pre").first().textContent().catch(() => "");
  if (!dotText.includes("digraph qq_tt")) {
    issues.push({ kind: "export_missing_digraph", got: dotText.slice(0, 200) });
  }

  // Test loading gg_H (1-loop)
  console.log("[drive] settings -> load gg_H");
  await page.getByRole("button", { name: /^setup$/i }).click();
  await page.waitForTimeout(500);
  await page.locator("select").selectOption("sm").catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Load: gg_H/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^canvas$/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, "08-canvas-gg_H.png"), fullPage: true });

  await page.getByRole("button", { name: /^export$/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^export \.dot$/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, "09-export-gg_H.png"), fullPage: true });

  const ggHDot = await page.locator("pre").first().textContent().catch(() => "");
  if (!ggHDot.includes("digraph gg_H")) {
    issues.push({ kind: "gg_H_export_missing", got: ggHDot.slice(0, 200) });
  }
  if (!ggHDot.includes("lmb_index=0")) {
    issues.push({ kind: "gg_H_missing_loop_index", got: ggHDot.slice(0, 500) });
  }

  await browser.close();

  console.log(`\n[drive] ${issues.length} issues:`);
  for (const i of issues) console.log(JSON.stringify(i));
}

run().catch((e) => {
  console.error("[drive] fatal:", e);
  process.exit(1);
});

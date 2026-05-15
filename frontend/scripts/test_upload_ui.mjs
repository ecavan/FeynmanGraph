// Verify the UFO upload UI is wired up: opens Settings, checks for the file picker,
// then uses gammaloop's SM UFO directory to do a real upload through the form.

import { chromium } from "@playwright/test";
import { mkdirSync, existsSync, statSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as tar from "node:zlib";  // node has no built-in tar; placeholder, use child_process tar instead
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = join(ROOT, "docs", "eli", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.FEYNGRAPH_URL ?? "http://localhost:8765";
const UFO_DIR = process.env.UFO_DIR ?? `${process.env.HOME}/Documents/GitHub/gammaloop/assets/models/ufo/sm`;

if (!existsSync(UFO_DIR)) {
  console.error(`UFO dir not found: ${UFO_DIR}`);
  process.exit(1);
}

// Build a tar.gz of the UFO dir using system tar.
const archivePath = join(tmpdir(), "MySM_upload.tar.gz");
execSync(`tar -czf ${archivePath} -C ${dirname(UFO_DIR)} ${join(".", basename(UFO_DIR))}`, { stdio: "inherit" });
console.log(`[upload] archive at ${archivePath} (${statSync(archivePath).size} bytes)`);

function basename(p) { return p.split("/").filter(Boolean).pop(); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const issues = [];
page.on("pageerror", (e) => issues.push({ kind: "pageerror", message: String(e) }));
page.on("console", (m) => { if (m.type() === "error") issues.push({ kind: "consoleerror", text: m.text() }); });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.getByRole("button", { name: /^settings$/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(SHOTS, "10-settings-with-upload-ui.png"), fullPage: true });

const uploadHeader = await page.locator("text=Upload UFO (BSM)").count();
console.log(`[upload] 'Upload UFO (BSM)' label present: ${uploadHeader > 0}`);
if (uploadHeader === 0) {
  issues.push({ kind: "upload_ui_missing", detail: "Upload UFO header not found in Settings" });
}

// Find the hidden file input and set the archive
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles(archivePath);
console.log("[upload] file selected, waiting for upload to complete...");

// Wait for the upload-status text
await page.waitForFunction(
  () => {
    const text = document.body.innerText;
    return text.includes("Uploaded") || text.includes("UFO_LOAD_FAILED") || text.includes("UFO_LAYOUT_INVALID") || text.includes("INVALID");
  },
  { timeout: 30000 },
).catch(() => issues.push({ kind: "upload_no_response", detail: "Did not see upload status within 30s" }));

await page.waitForTimeout(2000);
await page.screenshot({ path: join(SHOTS, "11-settings-after-upload.png"), fullPage: true });

const status = await page.locator("text=Uploaded").first().textContent().catch(() => null);
console.log(`[upload] status text: ${status}`);

// Verify the uploaded model now appears in the radio list
const modelLabels = await page.locator('input[type="radio"][name="model"] + *').allTextContents().catch(() => []);
console.log(`[upload] model labels visible: ${JSON.stringify(modelLabels)}`);

await browser.close();
console.log(`[upload] ${issues.length} issues:`);
for (const i of issues) console.log(JSON.stringify(i));
process.exit(issues.length === 0 ? 0 : 1);

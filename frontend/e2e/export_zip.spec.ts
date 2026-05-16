import { expect, test } from "@playwright/test";

test("export-all: ZIP download works", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "gg → H (1-loop)" }).click();
  await page.getByTestId("generate-submit").click();
  await expect(page.getByText(/\d+ diagrams?/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("export-all")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-all").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

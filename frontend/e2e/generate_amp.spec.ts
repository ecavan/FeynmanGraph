import { expect, test } from "@playwright/test";

test("generate-amp flow: fill form, submit, load a diagram into canvas", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  // Default view is Generate.
  await expect(page.getByTestId("view-generate")).toBeVisible();
  await expect(page.getByText(/Generate diagrams/i)).toBeVisible();

  await page.getByTestId("generate-submit").click();

  await expect(page.getByText(/\d+ diagrams?/i)).toBeVisible({ timeout: 30_000 });
  const loadButtons = page.getByRole("button", { name: /^load$/i });
  await expect(loadButtons.first()).toBeVisible();

  await loadButtons.first().click();
  await expect(page.getByTestId("view-canvas")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(6, { timeout: 5_000 });
});

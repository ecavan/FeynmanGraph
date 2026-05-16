import { expect, test } from "@playwright/test";

test("click-to-create edge: green-highlight first click, edge appears on second", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  // Generate a quick diagram so we have a populated canvas.
  await page.getByRole("button", { name: "e+ e- → μ+ μ-" }).click();
  await page.getByTestId("generate-submit").click();
  await expect(page.getByText(/\d+ diagrams?/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^load$/i }).first().click();
  await expect(page.getByTestId("view-canvas")).toBeVisible();

  // Verify the edge-draft flow works.
  await page.getByTestId("add-particle").click();
  await expect(page.getByTestId("edge-draft-hint")).toBeVisible();
  await expect(page.getByTestId("edge-draft-hint")).toContainText(/Click a vertex/i);

  // Click first vertex
  const nodes = page.locator(".react-flow__node-vertex");
  await nodes.nth(0).click();
  await expect(page.getByTestId("edge-draft-hint")).toContainText(/Click another vertex/i);

  // Click second vertex → edge created, selected, draft cleared
  await nodes.nth(1).click();
  await expect(page.getByTestId("edge-draft-hint")).not.toBeVisible();
});

test("self-loop button creates a tadpole on selected vertex", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "e+ e- → μ+ μ-" }).click();
  await page.getByTestId("generate-submit").click();
  await expect(page.getByText(/\d+ diagrams?/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^load$/i }).first().click();

  // Select a vertex (the first internal one)
  await page.locator(".react-flow__node-vertex").first().click();
  await expect(page.getByTestId("add-self-loop")).toBeVisible();

  const edgesBefore = await page.locator(".react-flow__edge").count();
  await page.getByTestId("add-self-loop").click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBefore + 1);
});

test("duplicate-edge creates a parallel edge", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "e+ e- → μ+ μ-" }).click();
  await page.getByTestId("generate-submit").click();
  await expect(page.getByText(/\d+ diagrams?/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^load$/i }).first().click();

  // Click an edge (the photon, internal)
  await page.locator(".react-flow__edge").first().click();
  await expect(page.getByTestId("duplicate-edge")).toBeVisible();

  const edgesBefore = await page.locator(".react-flow__edge").count();
  await page.getByTestId("duplicate-edge").click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBefore + 1);
});

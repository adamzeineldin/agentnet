import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8011";

// One shared, fresh backend: the story builds up across tests in order.
test.describe.configure({ mode: "serial" });

test("overview renders both robots from backend passports and live health", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("backend live")).toBeVisible();
  await expect(page.getByText("Robot A · Franka Emika Panda")).toBeVisible();
  await expect(page.getByText("Robot B · Universal Robots UR5e")).toBeVisible();
  await expect(page.getByText("No runs recorded yet")).toBeVisible();
});

test("robot fleet shows model-derived passport fields", async ({ page }) => {
  await page.goto("/robots?robot=ur5e_01");
  await expect(page.getByText("Side-by-side capability comparison")).toBeVisible();
  await expect(page.getByText("shoulder_pan_joint").first()).toBeVisible();
  await expect(page.getByText("attachment_site").first()).toBeVisible();
});

test("transfer lab: discover, publish, transfer, publish adaptation — real jobs", async ({ page }) => {
  await page.goto("/transfer");
  await page.getByRole("spinbutton").first().fill("7");
  await page.getByRole("button", { name: "Discover Skill" }).click();
  const publish = page.getByRole("button", { name: "Publish Experience" });
  await expect(publish).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("video").first()).toBeVisible();
  await publish.click();
  await expect(page.getByRole("button", { name: "✓ Published" })).toBeVisible();

  await page.getByRole("button", { name: "Transfer Skill" }).click();
  await expect(page.getByText("strategy adapted").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Collective Imagination · predicted futures")).toBeVisible();
  await expect(page.getByText("Offline deterministic planner").first()).toBeVisible();
  await page.getByRole("button", { name: "Publish Adaptation" }).click();
  await expect(page.getByRole("button", { name: "✓ Adaptation published" })).toBeVisible();

  await page.goto("/skills");
  await expect(page.getByText(/Adapted from skill_reach_far_side_/)).toBeVisible();
});

test("presentation replay plays the recorded chain and labels it as replay", async ({ page }) => {
  await page.goto("/present");
  await expect(page.getByText(/^REPLAY · recorded/)).toBeVisible();
  await expect(page.getByText("Searching for a way past the obstacle")).toBeVisible();
  await expect(page.getByText("0.5× speed · simulated time")).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Executing the adaptation and recording its lineage")).toBeVisible();
  await expect(page.getByText(/skill_reach_over_/)).toBeVisible();
});

test("run history shows a failed run honestly with its reason", async ({ page, request }) => {
  const res = await request.post(`${API}/api/robots/panda_01/motion-check`, { data: { target: [1.15, 0, 0.3] } });
  expect(res.status()).toBe(202);
  await page.goto("/history");
  await page.getByRole("tab", { name: "motion check" }).click();
  await expect(page.getByText("✕ failed").first()).toBeVisible();
  await page.getByText("✕ failed").first().click();
  await expect(page.getByText("IK found no collision-free solution").first()).toBeVisible();
});

test("evaluation page runs a benchmark and shows generated findings and raw rows", async ({ page }) => {
  await page.goto("/evaluation");
  await expect(page.getByText("No benchmark recorded yet")).toBeVisible();
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(page.getByText("Findings (generated from this run)")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Success on the \d+ comparable held-out scenes/)).toBeVisible();
  await expect(page.getByText(/Raw rows \(\d+\)/)).toBeVisible();
});

test("backend outage shows the offline banner", async ({ page }) => {
  await page.route(`${API}/api/health`, (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Backend unreachable at")).toBeVisible({ timeout: 15_000 });
});

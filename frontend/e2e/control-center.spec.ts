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

test("URSim option is disabled and labelled when no controller bridge is configured", async ({ page, request }) => {
  const status = await (await request.get(`${API}/api/controller/status`)).json();
  expect(status.configured).toBe(false);
  await page.goto("/transfer");
  await expect(page.getByRole("checkbox", { name: "Also run on the URSim controller (not physical)" })).toBeDisabled();
  await expect(page.getByText("· not configured")).toBeVisible();
});

test("librarian organizes the registry offline without changing skills", async ({ page, request }) => {
  const before = await (await request.get(`${API}/api/skills`)).json();
  await page.goto("/skills");
  await page.getByRole("tab", { name: "Librarian" }).click();
  await expect(page.getByText("No library report yet. Press “Organize library”.")).toBeVisible();
  // Offline is the default, and the e2e backend runs without MODEL_API_KEY, so Muse is not selectable.
  await expect(page.getByRole("combobox", { name: "Librarian" })).toHaveValue("offline");
  await expect(page.getByRole("option", { name: /MODEL_API_KEY not configured/ })).toBeDisabled();
  await page.getByRole("button", { name: "Organize library" }).click();
  await expect(page.getByText("Offline rules · no model")).toBeVisible();
  await expect(page.getByText("Suggested next transfers")).toBeVisible();
  const report = await (await request.get(`${API}/api/library/reports/latest`)).json();
  expect(report.provider).toBe("offline_librarian");
  expect(report.usage).toBeNull();
  expect(report.skill_count).toBe(before.length);
  await page.getByRole("button", { name: `Open skill ${before[0].skill_id}`, exact: true }).first().click();
  await expect(page.getByRole("heading", { name: before[0].skill_id, exact: true })).toBeVisible();
  expect(await (await request.get(`${API}/api/skills`)).json()).toEqual(before);
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
  const failed = page.getByRole("button", { name: /Open motion check/ }).filter({ hasText: "failed" }).first();
  await expect(failed).toBeVisible();
  await failed.click();
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


test("theme choice survives navigation and reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Robot Fleet" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});


test("history filters and searchable skill memory use the recorded registry", async ({ page, request }) => {
  await page.goto("/history");
  await page.getByRole("tab", { name: "failed", exact: true }).click();
  await expect(page.getByRole("button", { name: /Open motion check/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Open discover/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "queued", exact: true }).click();
  await expect(page.getByText("No runs match these filters.")).toBeVisible();
  const skills = await (await request.get(`${API}/api/skills`)).json();
  await page.goto("/skills");
  await page.getByRole("textbox", { name: "Search shared memory" }).fill("no-matching-capsule");
  await expect(page.getByText("No skills match your search.")).toBeVisible();
  await page.getByRole("tab", { name: "Memory graph" }).click();
  await page.getByRole("button", { name: `Select ${skills[0].skill_id}`, exact: true }).press("Enter");
  await page.getByRole("button", { name: "Open skill evidence" }).click();
  await expect(page.getByRole("heading", { name: skills[0].skill_id, exact: true })).toBeVisible();
});


test("redesigned routes fit a narrow screen with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/", "/robots", "/history", "/skills", "/transfer", "/evaluation"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `${route} should fit the viewport` }).toBe(true);
  }
});

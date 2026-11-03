import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8011";

// One shared, fresh backend: the story builds up across tests in order.
test.describe.configure({ mode: "serial" });

test("home shows the hero and, below it, how it works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("backend live")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("One robot learns it.");
  await expect(page.getByRole("heading", { name: "Teach one robot arm a task. Let a different arm do it too." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link")).toHaveCount(7);
});

test("robots page explains each robot plainly and keeps model-derived fields one click away", async ({ page }) => {
  await page.goto("/robots?robot=ur5e_01");
  await expect(page.getByRole("heading", { name: "Universal Robots UR5e" })).toBeVisible();
  await expect(page.getByText("Motors that can turn.")).toBeVisible();
  await expect(page.getByText("shoulder_pan_joint").first()).toBeHidden();
  await page.locator("summary", { hasText: "Technical sheet" }).click();
  await expect(page.getByText("shoulder_pan_joint").first()).toBeVisible();
  await expect(page.getByText("attachment_site").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add iiwa 14 to the fleet" })).toBeVisible();
});

test("teach: teach, save, learn, save — real jobs, explained in plain words", async ({ page }) => {
  await page.goto("/transfer");
  await expect(page.getByText("First let the Panda learn the task and save it (step 3).")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Reach past a wall/ })).toHaveAttribute("aria-checked", "true");
  await page.locator("summary", { hasText: "Repeat an exact layout" }).click();
  await page.getByRole("checkbox", { name: "Use an exact layout number" }).check();
  await page.getByRole("spinbutton", { name: "Layout number" }).fill("7");
  await page.getByRole("button", { name: "Teach the Panda" }).click();
  const save = page.getByRole("button", { name: "Save this skill" });
  await expect(save).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/The Panda found a way: /)).toBeVisible();
  await expect(page.locator("video").first()).toBeVisible();
  const steps = page.getByRole("list", { name: "What the simulator is doing" });
  await expect(steps.getByText("Check each route against the Panda's joints")).toBeVisible();
  await expect(steps.getByText(/10 of 10 checked/)).toBeVisible();
  await steps.getByRole("button", { name: /Watch physics try 1:/ }).click();
  await expect(page.getByText(/^Physics try 1: /)).toBeVisible();
  await page.getByRole("button", { name: "← back to the final run" }).click();
  await save.click();
  await expect(page.getByText("✓ Saved as a skill. Other robots can now learn it.")).toBeVisible();

  await page.getByRole("button", { name: "Let the UR5e learn it" }).click();
  await expect(page.getByRole("button", { name: "Save the UR5e's version" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/The UR5e used the Panda's idea|didn't work for the UR5e/)).toBeVisible();
  await expect(page.getByText("Read the Panda's saved skill")).toBeVisible();
  await expect(page.getByText(/The Panda has 7 joints and the UR5e has 6/)).toBeVisible();
  await page.locator("summary", { hasText: "How the skill was mapped onto the UR5e" }).click();
  await expect(page.getByRole("heading", { name: "What the UR5e was given" })).toBeVisible();
  await page.locator("summary", { hasText: "Technical detail" }).click();
  await expect(page.getByText("Collective Imagination · predicted futures")).toBeVisible();
  await expect(page.getByText("Offline deterministic planner").first()).toBeVisible();
  await page.getByRole("button", { name: "Save the UR5e's version" }).click();
  await expect(page.getByText(/✓ Saved\. It shows on the/)).toBeVisible();

  await page.goto("/skills");
  await expect(page.getByText("learned from the Panda").first()).toBeVisible();
});

test("URSim option is disabled and labelled when no controller bridge is configured", async ({ page, request }) => {
  const status = await (await request.get(`${API}/api/controller/status`)).json();
  expect(status.configured).toBe(false);
  await page.goto("/transfer");
  await page.locator("summary", { hasText: "More options" }).click();
  await expect(page.getByRole("checkbox", { name: "Also run on the URSim controller (not physical)" })).toBeDisabled();
  await expect(page.getByText("· not configured")).toBeVisible();
});

test("glossary hints explain jargon in place", async ({ page }) => {
  await page.goto("/transfer");
  await page.locator("summary", { hasText: "Repeat an exact layout" }).click();
  await page.getByRole("button", { name: "What does “Layout number” mean?" }).first().click();
  await expect(page.getByRole("tooltip")).toContainText("Each task type can be built in many layouts");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("real data page replays a recorded DROID episode on the Panda in MuJoCo", async ({ page }) => {
  await page.goto("/real");
  await expect(page.getByText("DROID (100-episode sample)")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Recorded episodes" }).getByRole("button")).toHaveCount(8);
  await page.getByRole("button", { name: /Put the orange rubber duck into the pot/ }).click();
  await page.getByRole("radio", { name: /Panda/ }).check();
  await page.getByRole("button", { name: "Replay in simulation" }).click();
  await expect(page.getByText("Max deviation from real path")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("same robot as recorded")).toBeVisible();
  await expect(page.getByText("✓ follows recorded path")).toBeVisible();
});

test("how it works sits on the home page and explains the idea, the task, each step, layouts and every evidence source", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page).toHaveURL(/\/#how-it-works$/);
  await expect(page.getByRole("list", { name: "The idea" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("img", { name: /Side view/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is a layout number?" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Pipeline" }).getByRole("listitem")).toHaveCount(5);
  await page.locator("summary", { hasText: "Technical detail" }).first().click();
  await expect(page.getByText(/inverse kinematics \(IK\), screened for collisions/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where the AI model fits" })).toBeVisible();
  await page.locator("summary", { hasText: "Glossary" }).click();
  await expect(page.getByRole("definition").filter({ hasText: "Each task type can be built in many layouts" })).toBeVisible();
  await expect(page.getByText("8 DROID episodes imported")).toBeVisible();
  await expect(page.getByText("not configured on this server")).toBeVisible();
  for (const label of ["real robot recording", "MuJoCo simulation", "URSim controller software", "model-written"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("librarian organizes the registry offline without changing skills", async ({ page, request }) => {
  const before = await (await request.get(`${API}/api/skills`)).json();
  await page.goto("/skills");
  await expect(page.getByText("No library report yet. Press “Organize library”.")).toBeVisible();
  // Offline is the default, and the e2e backend runs without MODEL_API_KEY, so Muse is not selectable.
  await expect(page.getByRole("combobox", { name: "Librarian" })).toHaveValue("offline");
  await expect(page.getByRole("option", { name: /MODEL_API_KEY not configured/ })).toBeDisabled();
  await page.getByRole("button", { name: "Organize library" }).click();
  await expect(page.getByText("Offline rules · no model")).toBeVisible();
  await expect(page.getByText(/^Teach the |Nothing to suggest/).first()).toBeVisible();
  const report = await (await request.get(`${API}/api/library/reports/latest`)).json();
  expect(report.provider).toBe("offline_librarian");
  expect(report.usage).toBeNull();
  expect(report.skill_count).toBe(before.length);
  await page.getByRole("button", { name: "Watch the Panda do it" }).first().click();
  await expect(page.locator("summary", { hasText: "The saved record" }).first()).toBeVisible();
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
  await page.getByRole("tab", { name: "Motion checks" }).click();
  const failed = page.getByRole("button", { name: /Open Motion check/ }).filter({ hasText: "failed" }).first();
  await expect(failed).toBeVisible();
  await failed.click();
  const dialog = page.getByRole("dialog", { name: "Motion check" });
  await expect(dialog).toBeInViewport();
  await expect(dialog.getByText("IK found no collision-free solution").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close run" }).click();
  await expect(dialog).toBeHidden();
});

test("results answers whether sharing helps, from a real benchmark run", async ({ page }) => {
  await page.goto("/evaluation");
  await expect(page.getByText("No benchmark recorded yet")).toBeVisible();
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(page.getByRole("region", { name: "The answer" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("region", { name: "Layouts solved" })).toContainText(/\d+ of \d+/);
  await expect(page.getByText("What the numbers say (generated from this run)")).toBeVisible();
  await expect(page.getByText(/Solved on the \d+ comparable new layouts/)).toBeVisible();
  await expect(page.locator("summary", { hasText: /Raw data · \d+ rows/ })).toBeVisible();
});

test("try it tells the story of the latest transfer from stored data", async ({ page, request }) => {
  const [transfer] = (await (await request.get(`${API}/api/runs?run_type=transfer&limit=50`)).json())
    .filter((r: { status: string }) => r.status === "succeeded");
  expect(transfer).toBeTruthy();
  await page.goto("/transfer");
  await page.locator("summary", { hasText: "How the skill was mapped onto the UR5e" }).click();
  for (const heading of ["What the UR5e was given", "The task is placed in front of the UR5e", "Which route to try first", "The physics test"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.getByText("order chosen by a fixed rule, no AI")).toBeVisible();
  await expect(page.getByRole("list", { name: "Learner's route order" }).getByText("chosen ·")).toBeVisible();
  await expect(page.getByText(`${(transfer.endpoint_error_m * 1000).toFixed(1)} mm`).first()).toBeVisible();
});

test("a catalog arm can be added to the fleet and picked as the learner", async ({ page }) => {
  await page.goto("/robots");
  await page.getByRole("button", { name: "Add xArm 7 to the fleet" }).click();
  await expect(page).toHaveURL(/robot=xarm7_01/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "UFACTORY xArm 7" })).toBeVisible();
  await page.goto("/transfer");
  await page.getByRole("combobox", { name: "Learner" }).selectOption("xarm7_01");
  await expect(page.getByRole("heading", { name: "The xArm 7 learns it from the Panda" })).toBeVisible();
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
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Robots" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});


test("history filters and skills grouped by task use the recorded registry", async ({ page }) => {
  await page.goto("/history");
  await page.getByRole("tab", { name: "Failed", exact: true }).click();
  await expect(page.getByRole("button", { name: /Open Motion check/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Learned a task/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Running", exact: true }).click();
  await expect(page.getByText("No runs match these filters.")).toBeVisible();
  await page.getByRole("tab", { name: "Any result", exact: true }).click();
  await page.getByRole("tab", { name: "Learned from another robot" }).click();
  await page.getByRole("button", { name: /Open Learned from another robot/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Learned from another robot" });
  await expect(dialog).toBeInViewport();
  await expect(dialog.getByRole("button", { name: /Watch physics try 1:/ })).toBeVisible();
  await page.goto("/skills");
  await expect(page.getByRole("article", { name: "Reach past a wall · layout 7" })).toBeVisible();
  await page.getByRole("tab", { name: "xArm 7" }).click();
  await expect(page.getByText("The xArm 7 hasn't learned anything yet.")).toBeVisible();
  await page.getByRole("tab", { name: "UR5e" }).click();
  await expect(page.getByRole("article", { name: "Reach past a wall · layout 7" })).toContainText("learned from the Panda");
});


test("redesigned routes fit a narrow screen with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/", "/robots", "/real", "/history", "/skills", "/transfer", "/evaluation"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `${route} should fit the viewport` }).toBe(true);
  }
});

test("teach: a described goal picks a task type (offline scout without a model key) and sets up the steps", async ({ page }) => {
  await page.goto("/transfer");
  await page.getByPlaceholder(/Describe it/).fill("Put a cup on a high shelf");
  await page.getByRole("button", { name: "Ask Muse" }).click();
  await expect(page.getByText("Offline scout · no model call")).toBeVisible();
  await expect(page.getByText("Task type:").locator("b")).toHaveText("Reach onto a shelf");
  await page.getByRole("button", { name: "Use this" }).first().click();
  await expect(page).toHaveURL(/task=shelf_v1/);
  await expect(page.getByRole("radio", { name: /Reach onto a shelf/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/Task: Reach onto a shelf/)).toBeVisible();
});

test("robots: the example arm uploads, is completed by Nimbotics and joins the fleet", async ({ page }) => {
  await page.goto("/robots");
  await page.getByLabel("Robot model file").setInputFiles("public/examples/nimbotics-capsule-arm.xml");
  await page.getByLabel("Robot name").fill("Capsule arm");
  await page.getByRole("button", { name: "Upload and check" }).click();
  await expect(page.getByText(/The Capsule arm \(6 joints, reaches/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("listitem").filter({ hasText: /^Added 6 position servos/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fleet" }).getByText("Capsule arm")).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";

const API = "http://127.0.0.1:8011";

/** The Lab's choice for the picked robot and task: replay, adapt or learn directly. */
// What the librarian decided: "known" (replay), "adapt" (from another robot) or "learn" (directly).
const decision = (page: Page) => page.getByRole("region", { name: "What the librarian found" });

// One shared, fresh backend: the story builds up across tests in order.
test.describe.configure({ mode: "serial" });

test("home shows the hero and, below it, how it works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("One robot learns it.");
  await expect(page.getByRole("region", { name: "How it works" }).getByRole("list", { name: "The idea" })).toBeAttached();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link")).toHaveText(["Library", "Lab", "Blog"]);
});

test("robots page explains each robot plainly and keeps model-derived fields one click away", async ({ page }) => {
  await page.goto("/robots?robot=ur5e_01");
  await expect(page).toHaveURL(/\/library\?open=ur5e_01&view=robots$/);
  await expect(page.getByRole("heading", { name: "Universal Robots UR5e" })).toBeVisible();
  await expect(page.getByTitle(/^Motors that can turn\./)).toContainText("Joints");
  await expect(page.getByText("shoulder_pan_joint").first()).toBeHidden();
  await page.locator("summary", { hasText: "Technical sheet" }).click();
  await expect(page.getByText("shoulder_pan_joint").first()).toBeVisible();
  await expect(page.getByText("attachment_site").first()).toBeVisible();
  await page.getByRole("button", { name: "← Robots" }).click();
  await page.getByRole("button", { name: "+ Add a robot" }).click();
  await expect(page.getByRole("button", { name: "Add iiwa 14 to the fleet" })).toBeVisible();
});

test("lab: nobody knows the task, so the Panda learns it directly and it is saved", async ({ page }) => {
  await page.goto("/lab?robot=panda_01&task=wall_reach_v1");
  await expect(page.getByRole("button", { name: "Robot: Panda" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Chosen task" })).toContainText("Reach past a wall");
  await expect(decision(page)).toHaveAttribute("data-case", "learn");
  await expect(decision(page).getByRole("heading", { name: "No robot knows this yet." })).toBeVisible();
  await page.locator("summary", { hasText: "Repeat an exact layout" }).click();
  await page.getByRole("checkbox", { name: "Use an exact layout number" }).check();
  await page.getByRole("spinbutton", { name: "Layout number" }).fill("7");
  await page.getByRole("button", { name: "Let the Panda learn it" }).click();
  await expect(page.getByText("✓ Saved to the")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/The Panda found a way: /)).toBeVisible();
  await expect(page.locator("video").first()).toBeVisible();
  // Beside the recording: the measured result of the stored run and its final checks.
  await expect(page.getByText("simulation-verified")).toBeVisible();
  await expect(page.getByRole("list", { name: "Final checks" })).toContainText("✓ Touches nothing");
  await page.getByRole("group", { name: "Physics tries" }).getByRole("button", { name: /^Try 1 · / }).click();
  await expect(page.getByText(/^Physics try 1: /)).toBeVisible();
  await page.getByRole("button", { name: "← back to the final run" }).click();
  // Every stage stays available, folded away.
  const steps = page.getByRole("list", { name: "What the simulator is doing" });
  await expect(steps).toBeHidden();
  await page.locator("summary", { hasText: "How it was found" }).click();
  await expect(steps.getByText("Check each route against the Panda's joints")).toBeVisible();
  // Saved with the run, so the librarian now says the Panda knows it: nothing to retrain.
  await expect(decision(page)).toHaveAttribute("data-case", "known");
  await expect(page.getByRole("button", { name: "▶ Replay its simulation" })).toBeVisible();
});

test("lab: the UR5e adapts the Panda's skill (URSim stays off), and then only replays it", async ({ page, request }) => {
  const status = await (await request.get(`${API}/api/controller/status`)).json();
  expect(status.configured).toBe(false);
  await page.goto("/lab?robot=ur5e_01&task=wall_reach_v1");
  await expect(decision(page)).toHaveAttribute("data-case", "adapt");
  await expect(decision(page).getByRole("heading", { name: "New to the UR5e. The Panda knows it." })).toBeVisible();
  await page.locator("summary", { hasText: "More options" }).click();
  await expect(page.getByRole("checkbox", { name: "Also run on the URSim controller (not physical)" })).toBeDisabled();
  await expect(page.getByText("· not configured")).toBeVisible();
  await page.getByRole("button", { name: "Adapt it to the UR5e" }).click();
  await expect(page.getByText("✓ Saved to the")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/The UR5e used the Panda's idea|didn't work for the UR5e/)).toBeVisible();
  // The result beside the recording is set against the skill it came from, measured from both stored capsules.
  await expect(page.getByRole("columnheader", { name: "The Panda" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "The UR5e" })).toBeVisible();
  await page.locator("summary", { hasText: "How it was found" }).click();
  await expect(page.getByText("Read the Panda's saved skill")).toBeVisible();
  await expect(page.getByText(/The Panda has 7 joints and the UR5e has 6/)).toBeVisible();
  await expect(page.getByText("Collective Imagination · predicted futures")).toBeVisible();
  await expect(page.getByText("Offline deterministic planner").first()).toBeVisible();

  await expect(decision(page)).toHaveAttribute("data-case", "known");
  // The Panda's skill was just used, so there is nothing new to improve it with and nothing is retrained.
  await expect(page.getByText("No other robot has an untried skill of this task to improve it with.")).toBeVisible();
  await page.getByRole("button", { name: "▶ Replay its simulation" }).click();
  await expect(page.getByText("Recorded run, replayed. Nothing was retrained.")).toBeVisible();
});



test("glossary hints explain jargon in place", async ({ page }) => {
  await page.goto("/lab?robot=ur5e_01&task=shelf_v1");
  await page.locator("summary", { hasText: "Repeat an exact layout" }).click();
  await page.getByRole("button", { name: "What does “Layout number” mean?" }).first().click();
  await expect(page.getByRole("tooltip")).toContainText("Each task type can be built in many layouts");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("how it works sits on the home page: a four-beat story, plain questions and a way to try it", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page).toHaveURL(/\/#how-it-works$/);
  await expect(page.getByRole("list", { name: "The idea" }).getByRole("listitem")).toHaveCount(4);
  const questions = page.getByRole("region", { name: "Questions" });
  await expect(questions.locator("summary")).toHaveCount(7);
  await questions.locator("summary", { hasText: "Has this run on a real robot?" }).click();
  await expect(questions.getByText(/Not yet\. Results here are simulation-verified/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Try it now →" })).toHaveAttribute("href", "/lab");
  await expect(page.getByText("What this server has switched on")).toHaveCount(0);
});

test("a skill page shows who worked it out, who learned it, and plays the run behind it", async ({ page, request }) => {
  const before = await (await request.get(`${API}/api/skills`)).json();
  await page.goto("/library");
  await expect(page.getByText("What to teach next")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Reach past a wall · layout 7" }).click();
  const known = page.getByRole("list", { name: "Robots that know this skill" });
  await expect(known).toContainText("worked it out itself");
  await expect(known).toContainText("learned from the Panda");
  // The robot that worked it out is shown first, with its recorded solution.
  await expect(page.getByRole("region", { name: "The Panda's solution" })).toBeVisible();
  await expect(page.locator("summary", { hasText: "The saved record" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Open the run that made it →" }).first().click();
  await expect(page).toHaveURL(/[?&]run=/);
  await expect(page.getByRole("dialog", { name: "Learned a task" })).toBeInViewport();
  await page.getByRole("dialog", { name: "Learned a task" }).getByRole("button", { name: "Close run" }).click();
  await page.getByRole("button", { name: "Show the UR5e's solution" }).click();
  await expect(page.getByRole("region", { name: "The UR5e's solution" })).toContainText("learned from the Panda");
  await page.getByRole("button", { name: "Robot page →" }).click();
  await expect(page).toHaveURL(/view=robots.*open=ur5e_01/);
  await expect(page.getByRole("region", { name: "Skills it knows" })).toContainText("Reach past a wall · layout 7");
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

test("a robot's page lists its runs and shows a failed one honestly with its reason", async ({ page, request }) => {
  const res = await request.post(`${API}/api/robots/panda_01/motion-check`, { data: { target: [1.15, 0, 0.3] } });
  expect(res.status()).toBe(202);
  await page.goto("/library?view=robots&open=panda_01");
  const failed = page.getByRole("region", { name: "Its runs" })
    .getByRole("button", { name: /Open Motion check/ }).filter({ hasText: "failed" }).first();
  await expect(failed).toBeVisible();
  await failed.click();
  const dialog = page.getByRole("dialog", { name: "Motion check" });
  await expect(dialog).toBeInViewport();
  await expect(dialog.getByText("IK found no collision-free solution").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close run" }).click();
  await expect(dialog).toBeHidden();
});

test("lab: replaying a known skill shows its stored run and result, with the transfer detail folded away", async ({ page, request }) => {
  const [transfer] = (await (await request.get(`${API}/api/runs?run_type=transfer&limit=50`)).json())
    .filter((r: { status: string }) => r.status === "succeeded");
  expect(transfer).toBeTruthy();
  await page.goto("/lab?robot=ur5e_01&task=wall_reach_v1");
  await page.getByRole("button", { name: "▶ Replay its simulation" }).click();
  await expect(page.getByText("Recorded run, replayed. Nothing was retrained.")).toBeVisible();
  await expect(page.getByText("simulation-verified")).toBeVisible();
  // No 2D sketches or separate technical sections: one closed section holds the stages and the log.
  await expect(page.locator("summary", { hasText: "How the skill was mapped" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Technical detail" })).toHaveCount(0);
  await page.locator("summary", { hasText: "How it was found" }).click();
  await expect(page.getByText("Order routes by what worked for the Panda")).toBeVisible();
  await expect(page.getByText(`${(transfer.endpoint_error_m * 1000).toFixed(1)} mm`).first()).toBeVisible();
});

test("a catalog arm can be added to the fleet and picked as the learner", async ({ page }) => {
  await page.goto("/library?view=robots");
  await page.getByRole("button", { name: "+ Add a robot" }).click();
  await page.getByRole("button", { name: "Add xArm 7 to the fleet" }).click();
  await expect(page).toHaveURL(/open=xarm7_01/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "UFACTORY xArm 7" })).toBeVisible();
  await page.goto("/lab?task=wall_reach_v1");
  await page.getByRole("button", { name: /^Robot: / }).click();
  await page.getByRole("listbox", { name: "Robot" }).getByRole("option", { name: /xArm 7/ }).click();
  await expect(decision(page)).toHaveAttribute("data-case", "adapt");
  const from = page.getByRole("button", { name: /^Learn from: / });
  await expect(from).toContainText("best match");
  await from.click();
  await expect(page.getByRole("listbox", { name: "Learn from" }).getByRole("option")).toHaveCount(2);
});

test("backend outage shows the offline banner", async ({ page }) => {
  await page.route(`${API}/api/health`, (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Backend unreachable at")).toBeVisible({ timeout: 15_000 });
});


test("library: search filters skills, and a skill page leads to its runs and back", async ({ page }) => {
  await page.goto("/transfer?task=shelf_v1");
  await expect(page).toHaveURL(/\/lab\?task=shelf_v1$/);
  // The Runs view is gone; old links land on the Library.
  await page.goto("/history");
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("tab")).toHaveText([/^Skills/, /^Robots/]);

  await page.goto("/skills?robot=ur5e_01");
  await expect(page).toHaveURL(/\/library\?robot=ur5e_01$/);
  const row = page.getByRole("button", { name: "Open Reach past a wall · layout 7" });
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove filter UR5e" })).toBeVisible();
  const search = page.getByRole("combobox", { name: "Search the library" });
  // Typing a robot's name offers it as a filter; picking it replaces the UR5e token.
  await search.fill("xArm");
  await page.getByRole("option", { name: /xArm 7/ }).click();
  await expect(page).toHaveURL(/robot=xarm7_01/);
  await expect(page.getByText("No skills match.")).toBeVisible();
  await page.getByRole("button", { name: "Remove filter xArm 7" }).click();
  await search.fill("shelf");
  await expect(row).toHaveCount(0);
  await search.fill("");
  // The fixed choices sit in one Filters panel; a chosen one also shows as a token in the search bar.
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("radiogroup", { name: "Known by" }).getByRole("radio", { name: "Shared by several robots" }).click();
  await expect(page.getByRole("button", { name: "Remove filter Shared by several robots" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Filters" })).toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(/open=wall_reach_v1_s7/);
  await expect(page.getByRole("list", { name: "Robots that know this skill" })).toContainText("learned from the Panda");

  const runs = page.getByRole("list", { name: "Runs" });
  await runs.getByRole("button", { name: /Open Learned from another robot/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Learned from another robot" });
  await expect(dialog).toBeInViewport();
  await expect(dialog.getByRole("button", { name: /Watch physics try 1:/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Close run" }).click();
  await page.getByRole("button", { name: "Open the run that made it →" }).click();
  await page.getByRole("dialog", { name: "Learned a task" }).getByRole("button", { name: "Its saved skill →" }).click();
  await expect(page).not.toHaveURL(/run=/);
  await expect(page).toHaveURL(/open=wall_reach_v1_s7/);
  await expect(page.getByRole("heading", { name: "Reach past a wall · layout 7" })).toBeVisible();
});


test("redesigned routes fit a narrow screen with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/", "/library", "/library?open=wall_reach_v1_s7", "/library?view=robots", "/library?view=robots&open=panda_01", "/lab", "/blog", "/privacy"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `${route} should fit the viewport` }).toBe(true);
  }
});

test("lab: a described goal is matched to an existing task type, which the user confirms", async ({ page }) => {
  await page.goto("/lab?robot=ur5e_01");
  await page.getByPlaceholder(/Describe a task for the UR5e/).fill("Put a cup on a high shelf");
  await page.getByRole("button", { name: "Find a match" }).click();
  const suggestion = page.getByRole("region", { name: "Suggested task type" });
  // The keyword scout answered (no model key on the e2e server), and the card says so in one word.
  await expect(suggestion.getByText("Best match · offline")).toBeVisible();
  await expect(suggestion.getByText("Reach onto a shelf", { exact: true })).toBeVisible();
  await suggestion.getByRole("button", { name: "Use this task" }).click();
  await expect(page).toHaveURL(/task=shelf_v1/);
  await expect(page.getByRole("group", { name: "Chosen task" })).toContainText("Reach onto a shelf");
  await expect(decision(page)).toHaveAttribute("data-case", "learn");
});

test("lab: when no task type fits, designing one is the main action and the user still clicks it", async ({ page }) => {
  await page.goto("/lab?robot=ur5e_01");
  await page.getByPlaceholder(/Describe a task for the UR5e/).fill("Wipe a whiteboard with a sponge");
  await page.getByRole("button", { name: "Find a match" }).click();
  const suggestion = page.getByRole("region", { name: "Suggested task type" });
  await expect(suggestion.getByText("No close match · offline")).toBeVisible();
  await expect(suggestion.getByRole("button", { name: "Use this task" })).toHaveCount(0);
  // Nothing is designed until the user asks for it.
  await expect(page.getByText("New task type")).toHaveCount(0);
  await expect(suggestion.getByRole("button", { name: "Design a new task" })).toBeVisible();
  await suggestion.getByRole("button", { name: "Dismiss the suggestion" }).click();
  await expect(suggestion).toHaveCount(0);
});

test("lab: a new task is designed only when none fits, and asking again finds it instead of a duplicate", async ({ page }) => {
  await page.goto("/lab?robot=ur5e_01");
  const describe = page.getByPlaceholder(/Describe a task for the UR5e/);
  await describe.fill("Reach under a low beam");
  await page.getByRole("button", { name: "Find a match" }).click();
  const suggestion = page.getByRole("region", { name: "Suggested task type" });
  await expect(suggestion.getByText("Closest match · offline")).toBeVisible();
  // The question is answered in place, which searches again with the answer added to the description.
  await expect(suggestion.getByLabel(/Which is closer to what you mean/)).toBeVisible();
  await suggestion.getByLabel(/Which is closer to what you mean/).fill("it is a beam overhead");
  await suggestion.getByRole("button", { name: "Search again" }).click();
  await expect(describe).toHaveValue("Reach under a low beam. it is a beam overhead");
  await suggestion.getByRole("button", { name: "Design a new task" }).click();
  await expect(suggestion.getByText("New task type · offline template")).toBeVisible();
  await expect(suggestion.getByText("Reach under a beam", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Reach under a beam in 3D: / })).toBeVisible();
  await page.getByText("What was checked").click();
  await expect(page.getByText(/Start and target are 0\.48 m apart/)).toBeVisible();
  await page.getByRole("button", { name: "Use this task" }).click();
  await expect(page).toHaveURL(/task=custom_reach_under_a_beam_/);
  await expect(page.getByRole("group", { name: "Chosen task" })).toContainText("Reach under a beam");
  await expect(decision(page)).toHaveAttribute("data-case", "learn");

  await describe.fill("reach under the low beam");
  await page.getByRole("button", { name: "Find a match" }).click();
  await expect(suggestion.getByText("Reach under a beam", { exact: true })).toBeVisible();
  await expect(suggestion.getByRole("button", { name: "Use this task" })).toBeVisible();
});

test("robots: the example arm uploads, is completed by Nimbotics and joins the fleet", async ({ page }) => {
  await page.goto("/library?view=robots");
  await page.getByRole("button", { name: "+ Add a robot" }).click();
  await page.getByLabel("Robot model file").setInputFiles("public/examples/nimbotics-capsule-arm.xml");
  await page.getByLabel("Robot name").fill("Capsule arm");
  await page.getByRole("button", { name: "Upload and check" }).click();
  await expect(page.getByText(/The Capsule arm \(6 joints, reaches/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("listitem").filter({ hasText: /^Added 6 position servos/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fleet" }).getByText("Capsule arm")).toBeVisible();
});

test("sign-in sits top right and opens the Nimbotics sign-in pages (sign-in is off on the e2e server)", async ({ page }) => {
  await page.goto("/library");
  const signIn = page.getByRole("banner").getByRole("button", { name: "Sign in" });
  await expect(signIn).toBeVisible();
  const box = await signIn.boundingBox();
  expect(box!.x + box!.width).toBeGreaterThan((page.viewportSize()!.width * 3) / 4);
  await signIn.click();
  await expect(page).toHaveURL(/\/signin\?next=%2Flibrary$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in to your account");
  await expect(page.getByText(/^New to/)).toContainText("nimbotics");
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByText("Email accounts aren't switched on for this server yet.")).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Flibrary$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/signin\?next=%2Flibrary$/);
  await page.goto("/lab");
  await expect(page.getByRole("heading", { level: 1, name: "Lab" })).toBeVisible();
});

test("blog: write, read, edit and delete a post; text stays plain", async ({ page }) => {
  await page.goto("/blog");
  await page.getByRole("link", { name: "Write a post" }).first().click();
  await expect(page).toHaveURL(/\/blog\?write=1$/);
  await page.getByPlaceholder("What did your robot learn?").fill("Over the wall");
  await page.getByPlaceholder("Leave a blank line between paragraphs.").fill("First paragraph.\n\n<b>not bold</b>");
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("article", { name: "Preview" })).toContainText("<b>not bold</b>");
  await page.getByRole("tab", { name: "Write" }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/blog\?post=post_/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Over the wall");
  await expect(page.getByText("<b>not bold</b>")).toBeVisible();
  await expect(page.getByText("Guest", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByPlaceholder("What did your robot learn?").fill("Over the wall, edited");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Over the wall, edited");

  await page.goto("/blog");
  await expect(page.getByRole("link", { name: /Over the wall, edited/ })).toBeVisible();
  await page.getByRole("link", { name: /Over the wall, edited/ }).click();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.getByRole("link", { name: /Over the wall, edited/ })).toHaveCount(0);
});

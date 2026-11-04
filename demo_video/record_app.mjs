// Records the app clips used in the demo. Usage: node record_app.mjs [home|present|lab|library ...]
// Needs the local stack (make dev) with MODEL_API_KEY set so the Lab uses Meta Muse Spark.
import crypto from "crypto";
import { APP, browser, click, moveTo, newPage, record, smoothScroll, wait } from "./rec.mjs";

const GOAL = "Slide a part through a narrow gap between two posts";

async function home(b) {
  const p = await newPage(b);
  await p.goto(APP + "/", { waitUntil: "networkidle" });
  // Start pinned at the first beat of the scroll story, then scroll through it in step with the v03 narration:
  // Learn while "one robot learns a task", Remember on "saves what worked", Adapt on "another robot", Prove last.
  const track = await p.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => d.className.includes("h-[460vh]"));
    const top = el.getBoundingClientRect().top + scrollY;
    scrollTo(0, top);
    return { top, range: el.offsetHeight - innerHeight };
  });
  await moveTo(p, [1440, 790], 1);
  await wait(p, 2000);
  const r = await record(p, "home");
  const keys = [[0, 0], [0.6, 0], [5.5, 0.25], [11.0, 0.5], [14.8, 0.75], [17.4, 0.985]];
  const at = (s) => {
    const i = keys.findIndex(([t]) => t > s);
    if (i === -1) return keys.at(-1)[1];
    const [ta, pa] = keys[i - 1], [tb, pb] = keys[i];
    return pa + (pb - pa) * ((s - ta) / (tb - ta));
  };
  const t0 = Date.now();
  for (let s = 0; s < keys.at(-1)[0]; s = (Date.now() - t0) / 1000) {
    await p.evaluate((y) => scrollTo(0, y), Math.round(track.top + track.range * at(s)));
    await wait(p, 30);
  }
  await wait(p, 1800);
  await r.stop();
}

async function present(b) {
  const p = await newPage(b);
  await p.goto(APP + "/present", { waitUntil: "networkidle" });
  await wait(p, 1500);
  const r = await record(p, "present");
  await click(p, p.getByRole("button", { name: "3. Passports" }));
  r.mark("passports");
  await wait(p, 10000);
  await click(p, p.getByRole("button", { name: "4. Imagine" }));
  r.mark("imagine");
  await wait(p, 10000);
  await r.stop();
}

async function signUp(p) {
  await p.goto(APP + "/", { waitUntil: "networkidle" });
  const email = `demo-${crypto.randomBytes(4).toString("hex")}@example.test`;
  const password = crypto.randomBytes(18).toString("base64url");
  const status = await p.evaluate(async ([email, password]) => {
    const res = await fetch("http://localhost:8000/api/auth/register", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Adam" }),
    });
    return res.status;
  }, [email, password]);
  if (status !== 201) throw new Error(`register failed: ${status}`);
}

async function lab(b) {
  const p = await newPage(b);
  await signUp(p);
  await p.goto(APP + "/lab", { waitUntil: "networkidle" });
  await wait(p, 1200);
  const r = await record(p, "lab");
  await moveTo(p, [700, 300], 30);
  await wait(p, 800);
  await click(p, p.getByRole("button", { name: /^Robot: / }));
  await wait(p, 1600);
  await click(p, p.getByRole("option", { name: /UR5e/ }));
  await wait(p, 600);
  await click(p, p.getByPlaceholder(/Describe a task/));
  r.mark("typing");
  await p.getByPlaceholder(/Describe a task/).pressSequentially(GOAL, { delay: 48 });
  await wait(p, 500);
  await click(p, p.getByRole("button", { name: "Find a match" }));
  r.mark("asked");
  const suggestion = p.getByRole("region", { name: "Suggested task type" });
  await p.getByRole("button", { name: "Use this task" }).waitFor({ timeout: 90000 });
  r.mark("suggestion");
  await wait(p, 2500);
  await moveTo(p, p.getByText(/Design a new task/).first(), 30);
  await wait(p, 2500);
  await click(p, p.getByRole("button", { name: "Use this task" }));
  await p.getByRole("region", { name: "What the librarian found" }).waitFor({ timeout: 60000 });
  r.mark("decision");
  await wait(p, 3500);
  await moveTo(p, p.getByRole("button", { name: /Learn from/ }), 30);
  await wait(p, 2500);
  await click(p, p.getByText("More options"));
  await wait(p, 900);
  const select = p.locator("select").first();
  await click(p, select);
  await select.selectOption("meta");
  r.mark("muse_selected");
  await wait(p, 2200);
  await click(p, p.getByRole("button", { name: /Adapt it to the/ }));
  r.mark("adapt");
  await wait(p, 1500);
  const run = p.getByRole("region", { name: "The run" });
  const runTop = await run.evaluate((e) => e.getBoundingClientRect().top + scrollY);
  await smoothScroll(p, runTop - 90, 1600);
  await p.getByText(/Saved to|not saved|did not pass|failed/i).first().waitFor({ timeout: 180000 });
  r.mark("result");
  const top2 = await run.evaluate((e) => e.getBoundingClientRect().top + scrollY);
  await smoothScroll(p, top2 - 90, 1200);
  await wait(p, 9000);
  await click(p, p.getByText("How it was found"));
  await wait(p, 1200);
  const imag = p.getByText(/Collective Imagination/).first();
  const imagTop = await imag.evaluate((e) => e.getBoundingClientRect().top + scrollY);
  await smoothScroll(p, imagTop - 120, 2000);
  r.mark("imagination");
  await moveTo(p, p.getByText(/Model changed selection/).first(), 40);
  await wait(p, 9000);
  console.log((await run.innerText()).slice(0, 1200));
  await r.stop();
}


async function designer(b) {
  const p = await newPage(b);
  await signUp(p);
  await p.goto(APP + "/lab", { waitUntil: "networkidle" });
  await wait(p, 1200);
  const r = await record(p, "designer");
  if (process.env.DESIGN_ROBOT) {
    await click(p, p.getByRole("button", { name: /^Robot: / }));
    await wait(p, 900);
    await click(p, p.getByRole("option", { name: new RegExp(process.env.DESIGN_ROBOT) }));
    await wait(p, 500);
  }
  await click(p, p.getByPlaceholder(/Describe a task/));
  await p.getByPlaceholder(/Describe a task/).pressSequentially(process.env.DESIGN_GOAL, { delay: 42 });
  await wait(p, 400);
  await click(p, p.getByRole("button", { name: "Find a match" }));
  r.mark("asked");
  const design = p.getByRole("button", { name: "Design a new task" });
  await design.waitFor({ timeout: 90000 });
  r.mark("suggestion");
  await wait(p, 2500);
  await click(p, design);
  r.mark("designing");
  await p.getByText(/^(New task type|Already in the library)/).first().waitFor({ timeout: 180000 });
  r.mark("designed");
  const use = p.getByRole("region", { name: "Suggested task type" }).getByRole("button", { name: "Use this task" });
  await wait(p, 3500);
  await click(p, p.getByText("What was checked"));
  console.log((await p.getByRole("region", { name: "Suggested task type" }).innerText()).slice(0, 800));
  await wait(p, 9000);
  await click(p, use);
  const dec = p.getByRole("region", { name: "What the librarian found" });
  await dec.waitFor({ timeout: 60000 });
  r.mark("decision");
  await wait(p, 2500);
  await click(p, p.getByRole("button", { name: /Let the .* learn it/ }));
  r.mark("learn");
  await wait(p, 1500);
  const run = p.getByRole("region", { name: "The run" });
  await smoothScroll(p, (await run.evaluate((e) => e.getBoundingClientRect().top + scrollY)) - 90, 1600);
  await p.getByText(/Saved to|not saved|did not pass|failed/i).first().waitFor({ timeout: 240000 });
  r.mark("result");
  await smoothScroll(p, (await run.evaluate((e) => e.getBoundingClientRect().top + scrollY)) - 90, 1200);
  await wait(p, 9000);
  console.log((await run.innerText()).slice(0, 900));
  await r.stop();
}


async function question(b) {
  const p = await newPage(b);
  await signUp(p);
  await p.goto(APP + "/lab", { waitUntil: "networkidle" });
  await wait(p, 1200);
  const r = await record(p, "question");
  await click(p, p.getByPlaceholder(/Describe a task/));
  await p.getByPlaceholder(/Describe a task/).pressSequentially(process.env.Q_GOAL, { delay: 42 });
  await wait(p, 300);
  await click(p, p.getByRole("button", { name: "Find a match" }));
  r.mark("asked");
  await p.getByRole("region", { name: "Suggested task type" }).waitFor({ timeout: 90000 });
  r.mark("suggestion");
  const hasQ = await p.getByPlaceholder("Your answer").count();
  console.log("QUESTION?", hasQ, (await p.getByRole("region", { name: "Suggested task type" }).innerText()).replace(/\n+/g, " | "));
  if (hasQ) await moveTo(p, p.getByPlaceholder("Your answer"), 40);
  await wait(p, 7000);
  await r.stop();
}

async function library(b) {
  const p = await newPage(b);
  await p.goto(APP + "/library", { waitUntil: "networkidle" });
  await wait(p, 1500);
  const r = await record(p, "library");
  await moveTo(p, [700, 420], 30);
  await wait(p, 2500);
  const skill = p.getByText(/Reach onto a shelf/).first();
  await moveTo(p, skill, 30);
  await wait(p, 1500);
  await click(p, skill);
  await p.waitForLoadState("networkidle");
  r.mark("skill");
  await wait(p, 7000);
  await click(p, p.getByRole("tab", { name: /Robots/ }).or(p.getByText(/^Robots/)).first()).catch(() => p.goto(APP + "/robots")); await p.waitForLoadState("networkidle");
  r.mark("robots");
  await moveTo(p, [600, 400], 30);
  await wait(p, 6000);
  await r.stop();
}

const SCENES = { home, present, lab, designer, question, library };
const b = await browser();
try {
  for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES)) await SCENES[name](b);
} finally {
  await b.close();
}

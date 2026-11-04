// Re-records the slides, the How it works story and the Library in step with a voice take.
// Reads build/take_timing.json (written by build.py in take mode) and writes build/clips/<clip>_take.mp4,
// which build.py then uses as is. Usage: node record_timed.mjs [hook muse evidence end home library]
import fs from "fs";
import path from "path";
import { APP, browser, click, moveTo, newPage, record, wait } from "./rec.mjs";

const timing = JSON.parse(fs.readFileSync("build/take_timing.json", "utf8"));
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Seconds into the shot where `word` is said (the first time at or after `after`), minus `lead`. */
function at(clip, word, { after = 0, lead = 0.15 } = {}) {
  const seg = timing.find((s) => s.clip === clip || s.clip === `${clip}_take`);
  const hit = seg.words.find((w) => norm(w.w).startsWith(norm(word)) && w.s >= after);
  if (!hit) throw new Error(`"${word}" not found in ${clip}`);
  return Math.max(0, +(hit.s - lead).toFixed(2));
}
const shotLength = (clip) => timing.find((s) => s.clip === clip || s.clip === `${clip}_take`).length;

const CARD_KEYS = {
  card_hook: () => ({ l1: at("card_hook", "A", { lead: 0 }) + 0.1, l2: at("card_hook", "But"), l3: at("card_hook", "next", { lead: 0.3 }) }),
  card_muse: () => ({
    m_head: at("card_muse", "Muse"), m1: at("card_muse", "matches"), m2: at("card_muse", "designs"),
    m3: at("card_muse", "ranks"), m4: at("card_muse", "sums"), arrow: at("card_muse", "Physics", { lead: 0.4 }),
    p_head: at("card_muse", "Physics"), p1: at("card_muse", "Nothing"), p2: at("card_muse", "simulator"),
    p3: at("card_muse", "checks"),
  }),
  card_evidence: () => ({
    b1: at("card_evidence", "Sharing"), b2: at("card_evidence", "scratch"), b3: at("card_evidence", "plain"),
    sq: at("card_evidence", "cut"), lg: at("card_evidence", "11"),
  }),
  card_end: () => ({ e1: at("card_end", "One", { lead: 0 }), e2: at("card_end", "every"), logo: at("card_end", "This"),
    url: at("card_end", "This") + 0.4 }),
};

async function card(b, clip) {
  const delays = CARD_KEYS[clip]();
  const p = await newPage(b);
  const query = Object.entries(delays).map(([k, v]) => `${k}:${v}`).join(",");
  await p.goto(`file://${path.resolve("cards.html")}?card=${clip.replace("card_", "")}&delays=${query}`);
  await p.evaluate(() => document.fonts.ready);
  await wait(p, 600);
  const r = await record(p, `${clip}_take`);
  await p.evaluate(() => window.go());
  await wait(p, (shotLength(clip) + 0.6) * 1000);
  await r.stop();
  await p.context().close();
  console.log(clip, delays);
}

/** The scroll story: each beat starts on the sentence that explains it. */
async function home(b) {
  const keys = [[0, 0], [at("home", "One"), 0.02], [at("home", "It"), 0.25], [at("home", "different", { lead: 0.3 }), 0.5],
    [at("home", "physics", { lead: 0.3 }), 0.75], [shotLength("home") - 0.4, 0.985]];
  const p = await newPage(b);
  await p.goto(APP + "/", { waitUntil: "networkidle" });
  const track = await p.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => d.className.includes("h-[460vh]"));
    const top = el.getBoundingClientRect().top + scrollY;
    scrollTo(0, top);
    return { top, range: el.offsetHeight - innerHeight };
  });
  await moveTo(p, [1440, 790], 1);
  await wait(p, 2000);
  const r = await record(p, "home_take");
  const progress = (s) => {
    const i = keys.findIndex(([t]) => t > s);
    if (i === -1) return keys.at(-1)[1];
    const [ta, pa] = keys[i - 1], [tb, pb] = keys[i];
    return pa + (pb - pa) * ((s - ta) / (tb - ta));
  };
  const t0 = Date.now();
  for (let s = 0; s < shotLength("home") + 0.5; s = (Date.now() - t0) / 1000) {
    await p.evaluate((y) => scrollTo(0, y), Math.round(track.top + track.range * progress(s)));
    await wait(p, 30);
  }
  await r.stop();
  await p.context().close();
  console.log("home", keys);
}

/** Robots while "anyone can upload a robotic arm", then the skills list on "see which robot taught which". */
async function library(b) {
  const p = await newPage(b);
  await p.goto(APP + "/library", { waitUntil: "networkidle" });
  await click(p, p.getByRole("tab", { name: /Robots/ }).first());
  await p.waitForLoadState("networkidle");
  await moveTo(p, [900, 500], 1);
  await wait(p, 1500);
  const r = await record(p, "library_take");
  const t0 = Date.now();
  const until = async (s) => { const left = s * 1000 - (Date.now() - t0); if (left > 0) await wait(p, left); };
  await until(at("library", "upload", { lead: 0.6 }));
  await moveTo(p, p.getByText("+ Add a robot"), 30);
  await until(at("library", "see", { lead: 0.7 }));
  await click(p, p.getByRole("tab", { name: /Skills/ }).first());
  await wait(p, 500);
  await moveTo(p, p.getByText(/Reach onto a shelf/).first(), 30);
  await until(shotLength("library") + 0.5);
  await r.stop();
  await p.context().close();
}

const ALL = { hook: "card_hook", muse: "card_muse", evidence: "card_evidence", end: "card_end" };
const b = await browser();
try {
  for (const name of process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(ALL), "home", "library"]) {
    if (ALL[name]) await card(b, ALL[name]);
    else if (name === "home") await home(b);
    else if (name === "library") await library(b);
  }
} finally {
  await b.close();
}

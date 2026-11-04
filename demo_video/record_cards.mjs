// Records the title cards (CSS-animated) and renders the lower-third labels as transparent PNGs.
import fs from "fs";
import path from "path";
import { browser, newPage, record, wait } from "./rec.mjs";

const URL = "file://" + path.resolve("cards.html");
const CARDS = { hook: 10500, muse: 17500, evidence: 16000, end: 11000 };
export const LABELS = {
  passport: ["Robot passports · read from each robot's own model", "good"],
  match: ["Meta Muse Spark · matches my words to a task type", ""],
  librarian: ["Librarian · fixed rules over verified skills", "good"],
  rank: ["Muse Spark orders the routes · MuJoCo tests them", ""],
  result: ["Simulation-verified · saved only on a pass", "good"],
  audit: ["Real model call, logged: calls, tokens, cost, effect", ""],
  design: ["Meta Muse Spark · designed this task from one sentence", ""],
  fail: ["Failed in physics · nothing saved", "bad"],
  library: ["Shared library · which robot taught which", "good"],
};

const b = await browser();
try {
  const only = process.argv.slice(2);
  for (const [name, ms] of Object.entries(CARDS)) {
    if (only.length && !only.includes(name)) continue;
    const p = await newPage(b);
    await p.goto(`${URL}?card=${name}`);
    await p.evaluate(() => document.fonts.ready);
    await wait(p, 600);
    const r = await record(p, `card_${name}`);
    await p.evaluate(() => window.go());
    await wait(p, ms);
    await r.stop();
    await p.context().close();
  }
  fs.mkdirSync("build/labels", { recursive: true });
  const p = await newPage(b);
  for (const [name, [text, tone]] of Object.entries(LABELS)) {
    await p.goto(`${URL}?card=lt&text=${encodeURIComponent(text)}&tone=${tone}`);
    await p.evaluate(() => document.fonts.ready);
    await wait(p, 300);
    await p.screenshot({ path: `build/labels/${name}.png`, omitBackground: true });
  }
} finally {
  await b.close();
}

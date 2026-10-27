// Capture Control Center pages at 1920x1080 from a running stack (default: the demo stack).
// Usage: WEB=http://127.0.0.1:3000 node scripts/screenshots.mjs   → ../assets/screenshots/*.png
import { chromium } from "@playwright/test";

const WEB = process.env.WEB ?? "http://127.0.0.1:3000";
const OUT = new URL("../../assets/screenshots/", import.meta.url).pathname;
const shots = [
  ["01-overview", "/", null],
  ["02-robot-fleet", "/robots?robot=ur5e_01", null],
  ["03-transfer-lab", "/transfer", "Collective Imagination · predicted futures"],
  ["04-skill-library", "/skills", null],
  ["05-run-history", "/history", null],
  ["06-evaluation", "/evaluation", "Findings (generated from this run)"],
  ["07-present-discover", "/present", "Searching for a way past the obstacle"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const [name, path, waitText] of shots) {
  await page.goto(WEB + path, { waitUntil: "networkidle" });
  if (waitText) await page.getByText(waitText).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500); // let videos show a frame
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log("saved", name);
}
for (const [i, title] of [[3, "08-present-imagine"], [4, "09-present-adapt"]]) {
  await page.goto(`${WEB}/present`, { waitUntil: "networkidle" });
  await page.getByText(/^REPLAY/).waitFor();
  for (let k = 0; k < i; k++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}${title}.png` });
  console.log("saved", title);
}
await browser.close();

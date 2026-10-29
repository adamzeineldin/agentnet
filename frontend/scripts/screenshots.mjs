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
await page.goto(`${WEB}/skills`, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Memory graph" }).click();
await page.getByRole("group", { name: "Robot and skill memory graph" }).waitFor();
await page.screenshot({ path: `${OUT}10-memory-graph.png` });
await page.goto(`${WEB}/history`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Open transfer/ }).first().click();
await page.locator("video").waitFor();
await page.screenshot({ path: `${OUT}11-run-evidence.png` });
await page.goto(WEB, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Switch to dark theme" }).click();
await page.waitForTimeout(2500); // particle assembly
await page.screenshot({ path: `${OUT}12-overview-dark.png` });
await page.getByRole("button", { name: "Switch to light theme" }).click();
await page.waitForTimeout(250); // finish theme color transitions before the mobile capture
await page.setViewportSize({ width: 390, height: 844 });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.screenshot({ path: `${OUT}13-overview-mobile.png`, fullPage: true });
console.log("saved memory, run evidence, dark theme and mobile views");
await browser.close();

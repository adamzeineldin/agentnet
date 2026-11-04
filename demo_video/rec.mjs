// Screen recorder for the demo: Chromium screencast frames (JPEG q92, 1920x1080) assembled into an MP4,
// plus a visible cursor and click ripple (headless Chromium draws none).
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { chromium } from "../frontend/node_modules/playwright/index.mjs";

export const APP = "http://localhost:3000";
const CURSOR_JS = `
addEventListener('DOMContentLoaded', () => {
  const s = document.createElement('style');
  s.textContent = 'nextjs-portal{display:none!important} #__cur{position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;left:-40px;top:-40px;transition:transform .12s} #__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))} .__rip{position:fixed;z-index:2147483646;pointer-events:none;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:2px solid #e2552f;animation:__r .5s ease-out forwards} @keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}';
  document.head.appendChild(s);
  const c = document.createElement('div'); c.id = '__cur';
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.5 L10 13 L16 13 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  addEventListener('mousemove', e => { c.style.left = e.clientX - 3 + 'px'; c.style.top = e.clientY - 2 + 'px'; }, true);
  addEventListener('mousedown', e => { c.style.transform = 'scale(.85)'; const r = document.createElement('div'); r.className = '__rip';
    r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  addEventListener('mouseup', () => { c.style.transform = ''; }, true);
});`;

export async function browser() {
  return chromium.launch();
}

export async function newPage(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, ...opts });
  await ctx.addInitScript(CURSOR_JS);
  const page = await ctx.newPage();
  page.__mouse = { x: 720, y: 405 };
  return page;
}

/** Starts a screencast; returns stop(outFile) which writes a constant-30fps H.264 MP4. */
export async function record(page, name) {
  const dir = path.resolve("build/frames", name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(dir, `f${String(frames.length).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const marks = {};
  const t0 = Date.now() / 1000;
  return {
    mark(label) { marks[label] = +(Date.now() / 1000 - t0).toFixed(2); console.log(name, label, marks[label]); },
    async stop() {
      const end = Date.now() / 1000;
      await cdp.send("Page.stopScreencast");
      if (!frames.length) throw new Error(`no frames recorded for ${name}`);
      const lead = frames[0].t - t0;  // time before the first frame arrived
      const lines = [];
      frames.forEach((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : end;
        const dur = Math.max(next - f.t, 0.001) + (i === 0 ? Math.max(lead, 0) : 0);
        lines.push(`file '${f.file}'`, `duration ${dur.toFixed(4)}`);
      });
      lines.push(`file '${frames.at(-1).file}'`);
      const list = path.join(dir, "list.txt");
      fs.writeFileSync(list, lines.join("\n"));
      fs.mkdirSync("build/clips", { recursive: true });
      const out = path.resolve("build/clips", `${name}.mp4`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xf5f4f0,fps=30",
        "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", out]);
      fs.writeFileSync(path.resolve("build/clips", `${name}.marks.json`), JSON.stringify(marks, null, 1));
      console.log(name, "->", out, `${frames.length} frames`);
      return marks;
    },
  };
}

/** Moves the visible cursor smoothly to a locator (or point) and clicks it. */
export async function moveTo(page, target, steps = 28) {
  let x, y;
  if (Array.isArray(target)) [x, y] = target;
  else {
    await target.scrollIntoViewIfNeeded();
    const b = await target.boundingBox();
    x = b.x + b.width / 2; y = b.y + b.height / 2;
  }
  await page.mouse.move(x, y, { steps });
  page.__mouse = { x, y };
}

export async function click(page, target, { pause = 250 } = {}) {
  await moveTo(page, target);
  await page.waitForTimeout(pause);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

export async function smoothScroll(page, top, ms = 1400) {
  await page.evaluate(([top, ms]) => new Promise((done) => {
    const start = scrollY, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min((now - t0) / ms, 1);
      scrollTo(0, start + (top - start) * ease(t));
      t < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), [top, ms]);
}

export const wait = (page, ms) => page.waitForTimeout(ms);

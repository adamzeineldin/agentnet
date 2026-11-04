"use client";

import { useEffect, useRef } from "react";

type Particle = {
  kind: "link" | "hous" | "finger" | "dust" | "base" | "floor";
  k: number; u: number; a: number; cap: number; rr: number; part: number;
  x: number; y: number; vx: number; vy: number; delay: number; a0: number; s: number; ph: number; fl: number;
};
type MemoryParticle = { x: number; y: number; vx: number; vy: number; j: number; age: number };

/** Decorative illustration ported from particle-arm.reference.js, not simulation evidence. */
export function ParticleArm({ particles = 14000, armMotion = true, cursorMemory = true }: {
  particles?: number; armMotion?: boolean; cursorMemory?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const colors = useRef({ ink: "", mute: "", acc: "" });
  useEffect(() => {
    const el = canvas.current;
    if (!el || !el.parentElement) return;
    const wrapper = el.parentElement;
    const context = el.getContext('2d');
    if (!context) return;
    const ctx = context;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      colors.current = { ink: css.getPropertyValue('--ink').trim(), mute: css.getPropertyValue('--mute').trim(), acc: css.getPropertyValue('--acc').trim() };
    };
    readColors();
    const themeObserver = new MutationObserver(readColors);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    let W = 1, H = 1; const mouse = { x:-9999, y:-9999, in:false, lx:0, ly:0 };
    const resize = () => { const r = wrapper.getBoundingClientRect(), d = window.devicePixelRatio || 1; if (r.width < 2 || r.height < 2) return; const bw = Math.round(r.width * d), bh = Math.round(r.height * d); W = r.width; H = r.height; if (el.width !== bw || el.height !== bh) { el.width = bw; el.height = bh; } ctx.setTransform(d, 0, 0, d, 0, 0); dirty = true; };
    let dirty = true, safeL = 0;
    resize(); const ro = new ResizeObserver(resize); ro.observe(wrapper);
    const T: MemoryParticle[] = [];
    const onMove = (e: MouseEvent) => {
      const r = wrapper.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      mouse.in = mouse.x > 0 && mouse.y > 0 && mouse.x < W && mouse.y < H;
      if (mouse.in && (cursorMemory && !reduced.matches) && targets.length) {
        const dist = Math.hypot(mouse.x - mouse.lx, mouse.y - mouse.ly), n = Math.min(8, dist / 5 | 0);
        for (let i = 0; i < n && T.length < 500; i++) T.push({ x: mouse.x + (R() - .5) * 6, y: mouse.y + (R() - .5) * 6, vx: (R() - .5) * 3, vy: (R() - .5) * 3, j: targets[R() * targets.length | 0], age: 0 });
      }
      mouse.lx = mouse.x; mouse.ly = mouse.y;
    };
    window.addEventListener('mousemove', onMove);
    const R = Math.random, PI = Math.PI;
    let P: Particle[] = [], N = 0, t0 = performance.now(), targets: number[] = [];
    const LL = [.52, .3, .14], LR = [.068, .055, .043], HR = [.1, .084, .068, .046], HW = [.088, .074, .06, .032], BR = .1, BH = .1;
    const build = () => {
      N = particles; P = []; t0 = performance.now();
      const plan: [Particle["kind"], number, number][] = [['link',0,.25],['link',1,.2],['link',2,.07],['hous',0,.08],['hous',1,.1],['hous',2,.08],['hous',3,.04],['finger',0,.04],['finger',1,.04],['dust',0,.06]];
      plan.forEach(([kind, k, f]) => {
        const n = Math.round(N * f);
        for (let i = 0; i < n; i++) {
          const q = R(), cap = (kind === 'hous' && q < .45) ? (R() < .5 ? -1 : 1) : 0;
          P.push({ kind, k, u: R(), a: R() * PI * 2, cap, rr: R() < .7 ? 1 : .55, part: R(),
            x: R() * W * 1.3 - W * .15, y: R() * H * 1.3 - H * .15, vx:0, vy:0, delay: R() * .9 + (kind === 'base' || kind === 'floor' ? 0 : .15 + k * .12),
            a0: kind === 'dust' ? .2 + R() * .2 : kind === 'floor' ? .35 : .95, s: R() < .15 ? 2 : 1.4, ph: R() * 6.28, fl: 0 });
        }
      });
      targets = P.map((p, i) => i).filter(i => P[i].kind !== 'dust' && P[i].kind !== 'floor');
    };
    build();
    const pose = (t: number, m: number) => ({
      psi: 3.8 + m * .25 * Math.sin(t * .23),
      p1: 1.42 + m * .08 * Math.sin(t * .31 + .5),
      p2: .1 + m * .2 * Math.sin(t * .37 + 1.3),
      p3: -.5 + m * .25 * Math.sin(t * .5 + 2),
      open: .5 + .5 * Math.sin(t * .7),
    });
    const kin = (q: ReturnType<typeof pose>) => {
      const f = [Math.cos(q.psi), 0, Math.sin(q.psi)], s = [-Math.sin(q.psi), 0, Math.cos(q.psi)];
      const ph = [q.p1, q.p2, q.p3], d = ph.map(e => [f[0] * Math.cos(e), Math.sin(e), f[2] * Math.cos(e)]);
      const J = [[0, 0, 0]];
      for (let i = 0; i < 3; i++) J.push([J[i][0] + d[i][0] * LL[i], J[i][1] + d[i][1] * LL[i], J[i][2] + d[i][2] * LL[i]]);
      return { f, s, d, J, q };
    };
    const wp = (p: Particle, K: ReturnType<typeof kin>) => {
      const { f, s, d, J } = K; let P3, n;
      if (p.kind === 'link') {
        const dd = d[p.k], n2 = [dd[1] * s[2] - dd[2] * s[1], dd[2] * s[0] - dd[0] * s[2], dd[0] * s[1] - dd[1] * s[0]];
        const c = Math.cos(p.a), sn = Math.sin(p.a), r = LR[p.k];
        n = [s[0] * c + n2[0] * sn, s[1] * c + n2[1] * sn, s[2] * c + n2[2] * sn];
        const L = LL[p.k] * p.u, A = J[p.k];
        P3 = [A[0] + dd[0] * L + n[0] * r, A[1] + dd[1] * L + n[1] * r, A[2] + dd[2] * L + n[2] * r];
      } else if (p.kind === 'hous') {
        const c = Math.cos(p.a), sn = Math.sin(p.a), A = J[p.k], rad = [f[0] * c, sn, f[2] * c];
        if (p.cap) { const r = HR[p.k] * p.rr, w = HW[p.k] * p.cap; n = [s[0] * p.cap, 0, s[2] * p.cap]; P3 = [A[0] + s[0] * w + rad[0] * r, A[1] + rad[1] * r, A[2] + s[2] * w + rad[2] * r]; }
        else { const w = HW[p.k] * (p.u * 2 - 1), r = HR[p.k]; n = rad; P3 = [A[0] + s[0] * w + rad[0] * r, A[1] + rad[1] * r, A[2] + s[2] * w + rad[2] * r]; }
      } else if (p.kind === 'base') {
        const a = p.a + K.q.psi, c = Math.cos(a), sn = Math.sin(a);
        if (p.part < .55) { n = [c, 0, sn]; P3 = [c * BR, p.u * BH, sn * BR]; }
        else if (p.part < .78) { const r = BR * p.rr; n = [0, 1, 0]; P3 = [c * r, BH, sn * r]; }
        else { const r = BR * (1.25 + .25 * p.rr); n = [0, 1, 0]; P3 = [c * r, .004, sn * r]; }
      } else if (p.kind === 'finger') {
        const dd = d[2], side = (p.k ? 1 : -1) * (.012 + .022 * K.q.open), A = J[3], L = .085 * p.u, c = Math.cos(p.a) * .009, sn = Math.sin(p.a) * .009;
        n = [f[0], 0, f[2]];
        P3 = [A[0] + dd[0] * L + s[0] * (side + c), A[1] + dd[1] * L + sn, A[2] + dd[2] * L + s[2] * (side + c)];
      } else {
        const r = p.rr === 1 ? .24 : .34; n = [0, 1, 0]; P3 = [Math.cos(p.a) * r, 0, Math.sin(p.a) * r];
      }
      return [P3, n];
    };
    const tau = .34, ct = Math.cos(tau), st = Math.sin(tau), D = 2.8, LGT = (() => { const v = [-.55, .75, -.55], l = Math.hypot(...v); return v.map(x => x / l); })();
    let S = 1, CX = 0, BY = 0;
    const proj = (P3: number[]) => { const Y = P3[1] * ct + P3[2] * st, Z = P3[2] * ct - P3[1] * st, k = D / (Z + D); return [CX + P3[0] * S * k, BY - Y * S * k, k]; };
    const shade = (n: number[]) => { const lam = Math.max(0, n[0] * LGT[0] + n[1] * LGT[1] + n[2] * LGT[2]), face = -(n[1] * -st + n[2] * ct); return (face < 0 ? .45 : 1) * (.4 + .6 * lam) + (face > 0 && face < .3 ? .25 : 0); };
    const loop = (now: number) => {
      if (W < 2 || H < 2) { resize(); frame.current = requestAnimationFrame(loop); return; }
      const t = reduced.matches ? 8 : (now - t0) / 1000, m = (armMotion && !reduced.matches) ? 1 : 0, mem = cursorMemory && !reduced.matches;
      if (dirty) {
        dirty = false;
        const wr = wrapper.getBoundingClientRect();
        const copy = el.closest('[data-landing-hero]')?.querySelector('[data-hero-copy]');
        safeL = copy ? copy.getBoundingClientRect().right - wr.left + 28 : W * .3;
        CX = W * .8;
        let maxX = 0, minY = 0;
        for (let tt = 0; tt < 90; tt += .2) {
          const G = kin(pose(tt, 1)), d3 = G.d[2], tip = [G.J[3][0] + d3[0] * .1, G.J[3][1] + d3[1] * .1, G.J[3][2] + d3[2] * .1];
          [G.J[1], G.J[2], G.J[3], tip].forEach((q) => {
            const Y = q[1] * ct + q[2] * st, Z = q[2] * ct - q[1] * st, k = D / (Z + D), x = q[0] * k, y = -Y * k;
            maxX = Math.max(maxX, x + .08); minY = Math.min(minY, y - .08);
          });
        }
        const off = .09, right = W - 24;
        S = Math.min(H * 1.55, (H - 30) / -(off + minY));
        CX = Math.min(W * .82, right - maxX * S);
        BY = H + off * S;
      }
      const K = kin(pose(t, m));
      ctx.clearRect(0, 0, W, H);
      const c = colors.current || { ink:'#17191b', mute:'#6b6f73', acc:'#d65a31' };
      for (const p of P) {
        if (p.kind === 'dust') { p.x += Math.sin(t * .3 + p.ph) * .15; p.y += Math.cos(t * .25 + p.ph) * .12; ctx.fillStyle = c.ink; ctx.globalAlpha = p.a0 * Math.min(1, t / 2); ctx.fillRect(p.x, p.y, 1.1, 1.1); continue; }
        const [P3, n] = wp(p, K), sc = proj(P3);
        const tx = sc[0] + Math.sin(t * 1.3 + p.ph) * .4, ty = sc[1] + Math.cos(t * 1.1 + p.ph) * .4;
        const r = Math.max(0, Math.min(1, (t - p.delay) / 1.6)), e = 1 - Math.pow(1 - r, 3), k = r > 0 ? .004 + .09 * e : 0;
        p.vx += (tx - p.x) * k; p.vy += (ty - p.y) * k;
        const damp = r > 0 ? .83 : .96; p.vx *= damp; p.vy *= damp;
        if (r === 0) { p.vx += (R() - .5) * .05; p.vy += (R() - .5) * .05; }
        if (reduced.matches) { p.x = tx; p.y = ty; } else { p.x += p.vx; p.y += p.vy; }
        const b = p.kind === 'floor' ? 1 : shade(n), sz = p.s * sc[2];
        if (p.fl > .02) { ctx.fillStyle = c.acc; ctx.globalAlpha = Math.min(1, p.fl * 1.4); ctx.fillRect(p.x - .5, p.y - .5, sz + 1.2, sz + 1.2); p.fl *= .965; continue; }
        const cf = p.x < safeL ? Math.max(.12, 1 - (safeL - p.x) / 50) : 1;
        ctx.fillStyle = c.ink; ctx.globalAlpha = p.a0 * b * (.3 + .7 * e) * cf; ctx.fillRect(p.x, p.y, sz, sz);
      }
      const ready = Math.max(0, Math.min(1, (t - 2.4) / .8));
      if (mem && mouse.in && ready > 0) {
        const RAD = 170, lags = [1.2, 2.4, 3.6, 4.8];
        ctx.fillStyle = c.acc;
        lags.forEach((lag, li) => {
          const G = kin(pose(t + lag, m)), fade = (1 - li / lags.length) * .75 * ready;
          for (let i = 0; i < P.length; i += 2) {
            const p = P[i]; if (p.kind === 'dust' || p.kind === 'floor' || p.kind === 'base') continue;
            const sc = proj(wp(p, G)[0]), dx = sc[0] - mouse.x, dy = sc[1] - mouse.y, d2 = dx * dx + dy * dy;
            if (d2 > RAD * RAD) continue;
            const fall = 1 - Math.sqrt(d2) / RAD;
            ctx.globalAlpha = fade * fall * fall * .9; ctx.fillRect(sc[0], sc[1], 1.1, 1.1);
          }
        });
      }
      ctx.fillStyle = c.acc;
      for (let i = T.length - 1; i >= 0; i--) {
        const q = T[i], tp = P[q.j]; q.age += 1 / 60;
        const k = .006 + Math.min(.05, q.age * .03);
        q.vx += (tp.x - q.x) * k; q.vy += (tp.y - q.y) * k; q.vx *= .9; q.vy *= .9; q.x += q.vx; q.y += q.vy;
        if (Math.hypot(tp.x - q.x, tp.y - q.y) < 3 || q.age > 4) { tp.fl = 1; T.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, q.age * 4) * .85; ctx.fillRect(q.x, q.y, 1.6, 1.6);
      }
      if (ready > 0) {
        ctx.fillStyle = c.acc; ctx.globalAlpha = ready;
        const Js = K.J.map(proj);
        [Js[1], Js[2], Js[3]].forEach(q => ctx.fillRect(q[0] - 2, q[1] - 2, 4, 4));
        ctx.font = "11px 'IBM Plex Mono', monospace"; ctx.strokeStyle = c.mute; ctx.lineWidth = 1;

      }
      ctx.globalAlpha = 1;
      if (!reduced.matches && !document.hidden) frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
    const resume = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(loop); };
    reduced.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    // Redraw a static arm on resize/theme changes for reduced-motion users too.
    const redraw = new ResizeObserver(resume);
    redraw.observe(wrapper);
    const recolor = new MutationObserver(resume);
    recolor.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      cancelAnimationFrame(frame.current);
      ro.disconnect(); redraw.disconnect(); themeObserver.disconnect(); recolor.disconnect();
      window.removeEventListener('mousemove', onMove);
      reduced.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [particles, armMotion, cursorMemory]);
  return <div className="particle-arm" aria-hidden="true"><canvas ref={canvas} className="absolute inset-0 size-full" /></div>;
}

"use client";

import { useEffect, useRef } from "react";
import {
  apply,
  buildHandParticles,
  graspCurl,
  particleWorld,
  solveHandPose,
  viewRotation,
  type HandParticle,
  type Vec3,
} from "@/lib/particleHand";

// Decorative only: this animation shows no robot data and is not driven by any run.
const ACCENT: Vec3 = [34, 211, 238];
const CORE: Vec3 = [226, 250, 255];
const INTRO_S = 1.8;
const CAMERA_Z = 6;
const REPEL_RADIUS = 70;
const REPEL_FORCE = 2.4;
const SPRING = 0.06;
const DAMPING = 0.82;
const DUST_COUNT = 70;

interface Spring {
  ox: Float32Array;
  oy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
}

interface Pointer {
  x: number;
  y: number;
  nx: number;
  ny: number;
  active: boolean;
}

interface ParticleHandProps {
  className?: string;
}

const mix = (a: Vec3, b: Vec3, t: number) =>
  `${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)}`;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function makeSprings(n: number): Spring {
  return { ox: new Float32Array(n), oy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n) };
}

/** Pushes particles away from the pointer and lets them spring back to the hand surface. */
function stepSpring(s: Spring, i: number, px: number, py: number, ptr: Pointer, dpr: number) {
  if (ptr.active) {
    const dx = px + s.ox[i] - ptr.x;
    const dy = py + s.oy[i] - ptr.y;
    const d = Math.hypot(dx, dy);
    const r = REPEL_RADIUS * dpr;
    if (d < r && d > 0.01) {
      const f = (REPEL_FORCE * dpr * (1 - d / r)) / d;
      s.vx[i] += dx * f;
      s.vy[i] += dy * f;
    }
  }
  s.vx[i] = (s.vx[i] - s.ox[i] * SPRING) * DAMPING;
  s.vy[i] = (s.vy[i] - s.oy[i] * SPRING) * DAMPING;
  s.ox[i] += s.vx[i];
  s.oy[i] += s.vy[i];
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  t: number,
  particles: readonly HandParticle[],
  scatter: Float32Array,
  dust: Float32Array,
  springs: Spring,
  ptr: Pointer,
  intro: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";

  const scale = Math.min(w, h * 0.92) / 2.45;
  const cx = w * 0.52;
  const cy = h * 0.5;
  const view = viewRotation(0.42 * Math.sin(t * 0.22) + ptr.nx * 0.4, -0.18 + ptr.ny * 0.22, 0.12 + 0.04 * Math.sin(t * 0.4));
  const pose = solveHandPose(graspCurl(t));
  const project = (v: Vec3): [number, number, number] => {
    const r = apply(view, v);
    const k = CAMERA_Z / (CAMERA_Z - r[2]);
    return [cx + r[0] * scale * k, cy - (r[1] - 0.1) * scale * k, r[2]];
  };

  for (let i = 0; i < DUST_COUNT; i++) {
    const x = (dust[i * 3] + t * 0.004 * (1 + dust[i * 3 + 2])) % 1;
    const y = (dust[i * 3 + 1] - t * 0.006 * dust[i * 3 + 2] + 1) % 1;
    ctx.fillStyle = `rgba(${mix(ACCENT, CORE, 0.2)},${0.06 + 0.12 * dust[i * 3 + 2]})`;
    ctx.fillRect(x * w, y * h, 1.4 * dpr, 1.4 * dpr);
  }

  const joints = pose.joints.map(project);
  ctx.lineWidth = dpr;
  ctx.strokeStyle = `rgba(${mix(ACCENT, CORE, 0.3)},${0.22 * intro})`;
  ctx.beginPath();
  for (const [a, b] of pose.bones) {
    ctx.moveTo(joints[a][0], joints[a][1]);
    ctx.lineTo(joints[b][0], joints[b][1]);
  }
  ctx.stroke();

  particles.forEach((p, i) => {
    const [tx, ty, z] = project(particleWorld(p, pose));
    const arrive = easeOutCubic((intro * INTRO_S - p.delay * 0.7) / (INTRO_S * 0.6));
    const sx = scatter[i * 2] * w + (tx - scatter[i * 2] * w) * arrive;
    const sy = scatter[i * 2 + 1] * h + (ty - scatter[i * 2 + 1] * h) * arrive;
    stepSpring(springs, i, sx, sy, ptr, dpr);
    const depth = Math.min(1, Math.max(0, (z + 1.2) / 2.4));
    const shimmer = 0.75 + 0.25 * Math.sin(t * 2.2 + p.delay * 40);
    ctx.fillStyle = `rgba(${mix(ACCENT, CORE, depth * 0.6)},${(0.22 + 0.55 * depth) * shimmer * (0.3 + 0.7 * arrive)})`;
    const size = p.size * dpr * (0.75 + 0.6 * depth);
    ctx.fillRect(sx + springs.ox[i] - size / 2, sy + springs.oy[i] - size / 2, size, size);
  });

  joints.forEach(([x, y, z], i) => {
    const depth = Math.min(1, Math.max(0, (z + 1.2) / 2.4));
    const pulse = 0.7 + 0.3 * Math.sin(t * 3 + i * 0.9);
    ctx.fillStyle = `rgba(${mix(ACCENT, CORE, 0.2)},${0.12 * intro * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, (5 + 4 * depth) * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${mix(ACCENT, CORE, 0.8)},${(0.5 + 0.5 * depth) * intro})`;
    ctx.beginPath();
    ctx.arc(x, y, (1.4 + depth) * dpr, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalCompositeOperation = "source-over";
}

export function ParticleHand({ className = "" }: ParticleHandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particles = buildHandParticles(window.innerWidth < 768 ? 0.8 : 1.6);
    const scatter = Float32Array.from({ length: particles.length * 2 }, () => Math.random());
    const dust = Float32Array.from({ length: DUST_COUNT * 3 }, () => Math.random());
    const springs = makeSprings(particles.length);
    const ptr: Pointer = { x: 0, y: 0, nx: 0, ny: 0, active: false };
    const target = { nx: 0, ny: 0 };
    let dpr = 1;
    let visible = true;
    let raf = 0;
    const start = performance.now();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };

    const render = (now: number) => {
      const t = reduced ? 2.2 : (now - start) / 1000;
      ptr.nx += (target.nx - ptr.nx) * 0.05;
      ptr.ny += (target.ny - ptr.ny) * 0.05;
      const intro = reduced ? 1 : Math.min(1, t / INTRO_S);
      drawFrame(ctx, canvas.width, canvas.height, dpr, t, particles, scatter, dust, springs, ptr, intro);
    };

    const loop = (now: number) => {
      if (visible && !document.hidden) render(now);
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ptr.x = (e.clientX - rect.left) * dpr;
      ptr.y = (e.clientY - rect.top) * dpr;
      ptr.active = true;
      target.nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      target.ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onLeave = () => {
      ptr.active = false;
      target.nx = 0;
      target.ny = 0;
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) render(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(canvas);

    if (reduced) {
      render(performance.now());
    } else {
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="particle-hand" className={`block h-full w-full ${className}`} />;
}

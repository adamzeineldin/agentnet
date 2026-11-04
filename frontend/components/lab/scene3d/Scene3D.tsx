"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Vec3 } from "@/lib/types";
import { bounds, buildScene, dispose, readPalette, type SceneContent } from "./build";

interface Scene3DProps extends SceneContent {
  /** What the scene shows, for screen readers (the canvas itself has no text). */
  label: string;
  /** Name for the base marker, e.g. "UR5e base". */
  baseLabel?: string;
  className?: string;
}

interface Label { key: string; at: Vec3; text: string }

const taskKey = (c: SceneContent) => JSON.stringify([c.start, c.target, c.obstacles, c.base]);

/** Re-render when the site's light/dark theme flips (it lives on <html data-theme>). */
function subscribeTheme(onChange: () => void): () => void {
  const watch = new MutationObserver(onChange);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => watch.disconnect();
}
const useTheme = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme ?? "light", () => "light");

/**
 * WebGL is checked once per page load and remembered: the check itself opens a context, and browsers allow only a
 * handful at a time. The server render assumes it is there.
 */
let webgl: boolean | null = null;
function canUseWebGL(): boolean {
  if (webgl === null) {
    try {
      const probe = document.createElement("canvas").getContext("webgl2");
      webgl = !!probe;
      probe?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const useWebGL = () => useSyncExternalStore(() => () => {}, canUseWebGL, () => true);

/**
 * A task layout in 3D, drawn from its stored geometry: obstacles, start, target and (when known) the robot base.
 * Drag to turn it. It renders only when something changes, so an idle scene costs nothing.
 */
export function Scene3D({ label, baseLabel, className = "", ...content }: Scene3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<{ frame: () => void; set: (c: SceneContent) => void } | null>(null);
  const failed = !useWebGL();
  const theme = useTheme();
  const key = JSON.stringify(content);
  const marks: Label[] = [
    { key: "start", at: content.start, text: "start" },
    { key: "target", at: content.target, text: "target" },
    ...(content.base && baseLabel ? [{ key: "base", at: content.base, text: baseLabel }] : []),
  ];

  // The renderer, camera and controls: made once per theme.
  useEffect(() => {
    const el = host.current;
    if (!el || failed) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const palette = readPalette();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.prepend(renderer.domElement);
    renderer.domElement.className = "block size-full cursor-grab active:cursor-grabbing";
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1, -2, 3);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableZoom: false, enablePan: false, minPolarAngle: 0.15, maxPolarAngle: Math.PI / 2 - 0.05 });
    let group: THREE.Group | null = null;
    let content: SceneContent | null = null;

    const placeLabels = () => {
      const { width, height } = renderer.domElement.getBoundingClientRect();
      el.querySelectorAll<HTMLSpanElement>("[data-at]").forEach((span) => {
        const at = JSON.parse(span.dataset.at ?? "[0,0,0]") as Vec3;
        const p = new THREE.Vector3(...at).project(camera);
        span.style.transform = `translate(${((p.x + 1) / 2) * width}px, ${((1 - p.y) / 2) * height}px) translate(-50%, -150%)`;
        span.style.opacity = p.z < 1 ? "1" : "0";
      });
    };
    const render = () => {
      renderer.render(scene, camera);
      placeLabels();
    };
    // A fit asked for before the pane had a size (first paint, a closed section) waits for the first real size.
    let fitPending = false;
    const frame = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      if (fitPending && content) {
        fitPending = false;
        const box = bounds(content);
        const centre = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() / 2;
        const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * (camera.aspect < 1 ? 1.2 : 0.95);
        // From the robot's right and a little above, like the MuJoCo camera: robot on the left, task on the right.
        camera.position.copy(centre).add(new THREE.Vector3(0.3, -1, 0.6).normalize().multiplyScalar(distance));
        controls.target.copy(centre);
      }
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const set = (next: SceneContent) => {
      // New task geometry re-frames the camera; the same task again keeps the user's angle.
      fitPending ||= !content || taskKey(content) !== taskKey(next);
      if (group) {
        scene.remove(group);
        dispose(group);
      }
      content = next;
      group = buildScene(next, palette);
      scene.add(group);
    };

    controls.addEventListener("change", render);
    const resize = new ResizeObserver(frame);
    resize.observe(el);
    view.current = { frame, set };
    return () => {
      resize.disconnect();
      controls.dispose();
      if (group) dispose(group);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      view.current = null;
    };
  }, [theme, failed]);

  useEffect(() => {
    view.current?.set(JSON.parse(key) as SceneContent);
    view.current?.frame();
  }, [key, theme]);

  return (
    <figure className={`min-w-0 ${className}`}>
      <div ref={host} role="img" aria-label={label}
        className="relative aspect-video overflow-hidden rounded-xl border border-line bg-panel-2/60">
        {failed && <p className="grid size-full place-items-center text-sm text-ink-3">This browser cannot show the 3D view (no WebGL).</p>}
        {!failed && marks.map((m) => (
          <span key={m.key} data-at={JSON.stringify(m.at)} aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full bg-panel/85 px-1.5 py-px text-[10px] text-ink-2 shadow-sm">
            {m.text}
          </span>
        ))}
        {!failed && <span aria-hidden="true" className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-ink-3">drag to turn</span>}
      </div>
    </figure>
  );
}

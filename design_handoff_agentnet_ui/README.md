# Handoff: AgentNet UI

> **For the agentnet repo (Next.js 16 + Tailwind v4 + FastAPI):** start with `IMPLEMENTATION.md`. It maps every screen to your existing routes, components and APIs.

## Overview
AgentNet is a simulation environment where robots learn skills, store them in a shared cloud memory, and retarget those skills onto other robots' joints. This package covers a public landing page plus a six-screen internal console: Fleet, Simulations, Sim viewer, Skills (with joint mapping), Cloud memory graph, and Logistics.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes that show the intended look and behavior. They are not production code to copy directly. Recreate them in the target codebase's existing environment (React, Vue, Electron, SwiftUI, etc.) using its established patterns. If no environment exists yet, choose the most appropriate framework and implement there.

- `AgentNet.dc.html` is the full clickable prototype. Open it in a browser (it needs `support.js` next to it). Markup is the template between `<x-dc>` tags. Logic, mock data and state are in the `<script data-dc-script>` class at the bottom.
- `particle-arm.reference.js` is the landing-page particle arm, extracted as standalone methods. It is plain Canvas 2D with no dependencies and can be ported nearly verbatim.

## Fidelity
**High-fidelity.** Colors, typography, spacing and interactions are final. Recreate them pixel-accurately. Striped areas are image placeholders (robot renders, sim thumbnails, live viewport, pose preview) to be replaced with real media or 3D views.

## Design Tokens
Implemented as CSS custom properties on `:root`. Dark mode sets `html[data-theme="dark"]`.

| Token | Light | Dark | Use |
|---|---|---|---|
| --bg | #f6f6f4 | #0f1112 | page background |
| --surf | #fbfbfa | #16181a | cards, nav, side panels |
| --ink | #17191b | #e9e9e5 | primary text, primary buttons, bars |
| --ink2 | #4f5357 | #b4b7ba | secondary text |
| --mute | #6b6f73 | #8c9094 | labels, captions |
| --faint | #9a9ea2 | #63676b | placeholder text, idle status |
| --line | rgba(0,0,0,.08) | rgba(255,255,255,.08) | hairline borders, dividers |
| --line2 | rgba(0,0,0,.18) | rgba(255,255,255,.2) | stronger borders, secondary buttons |
| --st1 / --st2 | #ededea / #e6e6e2 | #191b1d / #1e2022 | placeholder stripes (135°, 8–10px bands) |
| --acc | #d65a31 | #e36d43 | accent: running/training status, highlights, fail cells |
| --ok | #3f8f5f | #5aa877 | converged/verified status |
| --hover | #f0f0ed | #1c1f21 | list row hover/selected |

**Type.** IBM Plex Sans (300/400/500/600) for UI and IBM Plex Mono (400/500) for IDs, metrics, labels and eyebrows. Both are from Google Fonts.
- Landing H1: 64px / 300 / line-height 1.02 / letter-spacing −0.035em
- Page H2: 28px / 400 / −0.02em. Detail H2 (skill, sim): 34–36px / 300 / −0.03em
- Big metric: 22–32px / 300
- Body: 13–15px. Landing paragraph 18px / 1.55
- Eyebrow: Mono 11–12px, uppercase, letter-spacing 0.04–0.06em, color --acc
- Mono meta: 10.5–12.5px

**Shape.** Square corners everywhere (no border radius) except status dots and the avatar, which are circles. No shadows. Separation comes from 1px `--line` borders, and metric grids use a 1px gap over a `--line` background.

**Spacing.** Page padding 32px (landing 48px). Section gap 24px. Card padding 14–20px. Grid gaps 16px (cards) and 24px (panels).

**Buttons.** The primary button is `--ink` background with `--bg` text, 9–14px × 14–22px padding, and turns `--acc` on hover. The secondary button is a 1px `--line2` border that turns `--ink` on hover. Segmented controls are bordered groups where the selected segment is `--ink` with `--bg` text.

## Screens / Views

### 01 Landing
- Full-viewport, `--bg`. A particle canvas fills the right 62% (absolute, full height).
- Nav row: logo (12px `--ink` square + "agentnet", 16px/600) and links Simulations, Skills, Memory, Logistics, plus "Sign in" (ink, 500).
- Copy column (max-width 540px, vertically centered): eyebrow "SIMULATE · REMEMBER · RETARGET", H1 "One robot learns it.<br>Every robot remembers.", and a paragraph reading "AgentNet trains robots in simulation, stores what they learn in a shared cloud memory, and maps each skill onto the joints of any other robot." Below that are the buttons "Open console" (primary → Fleet) and "Browse skills" (secondary → Skills).
- Step row (3 columns, max-width 540px, each with a top border in `--line2`): "01 SIMULATE / Thousands of parallel environments per skill.", "02 REMEMBER / Converged policies land in shared memory.", "03 RETARGET / Skills map to new joint layouts and re-verify in sim."

### App shell
- 56px top bar in `--surf` with a bottom border. It holds the logo (→ landing) and the tabs Fleet, Simulations, Skills, Memory, Logistics. The active tab uses `--ink` text plus a 2px inset bottom bar; inactive tabs use `--mute`.
- Right side: "memory synced" (green dot), "412 envs live", a Dark/Light theme toggle and an avatar.

### 02 Fleet
- Grid `repeat(auto-fill, minmax(250px,1fr))`. Each card has a 4:3 render placeholder with a status chip (top-left) and DOF (top-right), then the name (16/500), the type, a 3-column stat row (Learned / Adopted / Sim hrs) and a current-task line.
- Clicking a card opens Memory with that robot selected.

### 03 Simulations
- Header with a segmented filter (All / Running / Converged / Queued) and a "New simulation" button.
- Grid `minmax(270px,1fr)`. Each card has a 16:9 thumbnail with a status chip and sim ID, the name, "robot · N envs", and a 2px success bar with a %.
- Clicking a card opens the Sim viewer.

### 04 Sim viewer
- Breadcrumb, title, "Fork run" (secondary) and "Commit to memory" (primary → Skills for that skill).
- Two columns, `1fr 340px`.
  - Left: a 16:9 viewport with overlays (status chip, t = seconds, rgb/depth/contacts toggles) and a transport bar (play/pause, scrub bar in `--acc`, episode counter, 1×/4×/16×).
  - Right: a 2×2 metric grid (Success, Episodes, Parallel envs, GPU·h), a "Success over training" bar chart (28 bars, logistic curve), and a 16×4 grid of 64 env cells (ink = pass, acc = fail, line2 = running). Clicking a cell focuses that env.
- Running sims tick every 700ms: episodes, scrub position and env cells all update.

### 05 Skills
- Two columns, `320px 1fr`.
- Left list: search field and skill rows (name, version, source robot, adopter count). The selected row gets `--hover` plus a 2px left accent.
- Right panel:
  - Header with the eyebrow "SKILL · vX", name, "Learned by X in 'sim'", Source success and Adopted by.
  - "Map to robot" chips for every robot except the source.
  - Joint mapping table (source joint → target joint, with a fit bar; fit ≥85 is ink, below that is acc; unmapped joints are faint) and a note.
  - Pose preview placeholder, Predicted success and Verify cost.
  - The CTA reads "Retarget and verify in sim", or "Already in X memory · open sim" if that robot has already adopted the skill.
- The mapping table and preview stack below ~800px (`repeat(auto-fit, minmax(380px,1fr))`).

### 06 Memory
- Two columns, `1fr 340px`.
- SVG graph (viewBox 900×600). Skills sit on an inner ellipse (rx 165, ry 110), sized 7 + 2.5 × adopters. Robots sit on an outer ellipse (rx 375, ry 225) as hollow circles. Edges are solid for learned and dashed (4 4) for adopted.
- Selecting a node turns it and its edges `--acc` and dims everything unconnected to 0.35. Labels are HTML positioned over the SVG.
- The side panel shows the node's type and name, grouped lists (Learned by / Adopted by, or Learned / Adopted from memory) that are clickable to jump to that node, and an action ("Open joint mapping" or "View simulations").

### 07 Logistics
- Range segmented control (24h / 7d / 30d) that scales the GPU numbers.
- 4 KPI cells: GPU-hours, Environments live, Skills in memory, Transfer success.
- Two panels: "GPU-hours by robot" (horizontal bars) and "Memory storage" (a stacked 24px bar with legend: Trajectories, Sim snapshots, Policies, Embeddings; 22.5 TB total).
- "Skill transfers" table with columns time, skill, from, to, fit, GPU·h, status (dot).

## Landing particle arm (`particle-arm.reference.js`)
- 3D robot arm built from particles (default **14,000**): three links (cylinders), four joint housings (cylinders with caps along the side axis), and two gripper fingers. There is no base; the shoulder sits just below the bottom edge so the arm rises out of the screen.
- **Projection:** camera tilt τ=0.34 rad, perspective D=2.8. Particle size and alpha scale with depth. Lambert shading uses a light direction of (−.55, .75, −.55). Back faces are drawn at 45% alpha.
- **Assembly on load:** particles start scattered. Each has a random delay (0–0.9s, plus a per-link stagger) and springs to its target with stiffness easing in over 1.6s (ease-out cubic), damping 0.83.
- **Motion:** slow sinusoidal yaw and joint angles (`pose(t)`, periods of 13–27s), plus a ±0.4px idle shimmer.
- **Cursor, predict:** within 170px of the cursor, faint `--acc` ghost arms show the poses 1.2/2.4/3.6/4.8s **in the future**, with "t+Ns" labels at the gripper tip. There is no ring around the cursor.
- **Cursor, write to memory:** moving the cursor emits `--acc` particles (up to 8 per move, capped at 500 alive). They fly into random arm particles, which flash `--acc` and fade back to ink.
- **Fit:** on resize, sweep poses to compute projected bounds. `S = min(H*1.55, topConstraint)`, `CX = min(W*.82, W − 24 − maxX·S)`. Particles left of the copy column's right edge fade to 12% alpha.
- Colors are read from the CSS variables `--ink`, `--mute` and `--acc` whenever the theme changes.
- Props: `particles`, `armMotion`, `cursorMemory`.

## State Management
- `screen`: landing | fleet | sims | viewer | skills | memory | logistics
- `simId`, `filter`, `playing`, `speed`, `envFocus`, `tick` (700ms interval while the viewer is running)
- `skillId`, `targetId`, `retargeted` (set of skill>robot keys)
- `nodeId` (`s:<skill>` or `r:<robot>`)
- `range` (24h | 7d | 30d)
- `theme` (light | dark), applied by setting `data-theme` on `<html>`
- All data is mocked in the `ROBOTS`, `SKILLS` and `SIMS` constants. Replace these with real API data. Robot names (Kestrel A6, Heron D7, Mako Q12, Juno H28, Wren M9) and all metrics are fictional.

## Assets
None. All imagery is placeholder stripes. You'll need: robot renders (4:3), sim thumbnails (16:9), a live sim viewport stream, and a pose-overlay preview.

## Files
- `AgentNet.dc.html`: full prototype, all screens
- `support.js`: runtime needed only to open the prototype in a browser (not for production)
- `particle-arm.reference.js`: landing arm canvas code
- `IMPLEMENTATION.md`: step-by-step plan for the agentnet Next.js frontend

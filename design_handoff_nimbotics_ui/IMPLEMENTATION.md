# Implementing this redesign in the nimbotics repo

Read this first, then use README.md for the visual spec.

## Your stack (from the repo)
- `frontend/`: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 (tokens in `app/globals.css` via `@theme inline`). Fonts are loaded with `next/font/google`.
- `backend/`: FastAPI and MuJoCo. The frontend calls it through `lib/api.ts`, `lib/useApi.ts` and `lib/useRunStream.ts`. Types live in `lib/types.ts`.
- Repo rules (`CLAUDE.md`) still apply. Most importantly: **every number must come from the backend.** All robot names, skills and metrics in the prototype are placeholders. Wire every one of them to real API data. Where the backend has no data for a slot, show an empty state; never hardcode values.
- Next 16 differs from older versions. Check `frontend/node_modules/next/dist/docs/` before using unfamiliar APIs.

## Step 1: Theme tokens (`app/globals.css`)
Replace the dark graphite/cyan palette with the tokens in README "Design Tokens". Keep the same Tailwind `@theme inline` pattern so existing utility classes keep working. Map:

| existing var | new value (light / dark) |
|---|---|
| --bg | #f6f6f4 / #0f1112 |
| --panel | #fbfbfa / #16181a (prototype `--surf`) |
| --panel-2 | #f0f0ed / #1c1f21 (prototype `--hover`) |
| --line | rgba(0,0,0,.08) / rgba(255,255,255,.08) |
| --line-strong | rgba(0,0,0,.18) / rgba(255,255,255,.2) |
| --ink, --ink-2, --ink-3 | prototype --ink, --ink2, --mute |
| --accent | #d65a31 / #e36d43 |
| --accent-dim | use --accent at reduced opacity, or drop it |
| --good | #3f8f5f / #5aa877 |
| --bad | keep it, or use --accent |
| --warn | keep |

- Add `html[data-theme="dark"]` overrides and remove `color-scheme: dark` from `:root`. Light is the default; a toggle in the header sets `data-theme` and saves the choice to localStorage.
- Remove the radial-gradient body background.
- Fonts: in `layout.tsx`, replace Geist and Geist Mono with `IBM_Plex_Sans` (weights 300–600) and `IBM_Plex_Mono` (400, 500) from `next/font/google`, keeping the `--font-sans` and `--font-mono` variables.
- The prototype uses square corners everywhere. Remove `rounded-md`/`rounded-*` from `ui.tsx` (Panel, Badge), from AppShell nav items and from cards.

## Step 2: Shell (`components/AppShell.tsx`)
- Header: 56px, `bg-panel`, bottom border. On the left, the logo is an 11px ink square plus "nimbotics" in lowercase at 600 weight.
- Nav items: no pill background. The active item gets `text-ink` and a 2px inset bottom bar (`shadow-[inset_0_-2px_0_var(--ink)]`); inactive items use `text-ink-3`.
- Right side: keep `HealthIndicator`, restyled as mono 12px text with a 6px status dot instead of a pill Badge. Add the theme toggle and keep the Present link.
- Keep `OfflineBanner` and the "simulation only" footer; restyle them with the new tokens.

## Step 3: Landing (`app/page.tsx` → `components/Overview.tsx`)
- Rebuild the top of Overview as the landing hero in README "01 Landing": copy column on the left, particle arm on the right, and the 3-step row underneath. Keep the existing live Overview content below the hero, or move it to the Fleet page.
- **Particle arm:** create `components/ParticleArm.tsx` (a `"use client"` component) by porting `particle-arm.reference.js`. It is dependency-free Canvas 2D: put the logic in a `useEffect` with a `ref` on the canvas, keep the class fields as refs, and cancel the animation frame, disconnect the ResizeObserver and remove the mousemove listener on cleanup. Mount it inside an absolutely positioned wrapper `div` (right 62%, full height). The code measures the wrapper, not the canvas. Read `--ink`, `--mute` and `--acc` from computed styles whenever the theme changes. Default `particles = 14000`.
- This replaces `ParticleHand`. You can delete `ParticleHand.tsx` and `lib/particleHand.ts`, or keep the shared math helpers (`mulberry32`, etc.) if they're useful.

## Step 4: Map prototype screens to existing routes
| Prototype screen | Route / component | Data source |
|---|---|---|
| Fleet | `/robots` → `RobotFleet`, `RobotCard` | `RobotSummary[]`. Use `snapshot_url` for the 4:3 render slot |
| Simulations grid | `/history` → `RunHistory` | `RunRecord[]`. Status filter maps onto `RunStatus` (running = any non-terminal status, plus succeeded/failed) |
| Sim viewer | run detail inside `/history`, or a new `/history/[runId]` | `RunRecord`, `useRunStream`, `RunVideo` for the viewport, `RunEvidence`/`EventLog` |
| Skills + joint mapping | `/skills` → `SkillLibrary` (list) and `/transfer` → `TransferLab` (mapping, retarget) | skill capsules, `RobotPassport.arm_joints`, `startTransfer`. The fit bars should show real IK/limit data from passports. Per repo rules, transfers re-solve IK from task intent, so label the table "joint correspondence", not copied angles |
| Cloud memory graph | `/skills` (graph view) using `LineageGraph` data | skill lineage plus the robot that published or adopted each skill |
| Logistics | `/evaluation` → `Evaluation`, plus run aggregates | `EvalStrip` rows, run `compute_seconds` and run counts. Only show metrics the backend actually computes; drop the GPU-hours and storage panels if nothing backs them |
| — | `/present` | Leave as is. No chrome; optionally restyle with the new tokens |

Keep the existing route names and nav labels unless you choose to rename them. The prototype's tab names (Fleet, Simulations, Skills, Memory, Logistics) are suggestions.

## Step 5: Restyle shared UI (`components/ui.tsx`)
- `Panel`: `bg-panel`, 1px `border-line`, no radius, no shadow. Title 14px/500.
- `Stat`: label 12px `text-ink-3`, value 22–32px weight 300.
- `Badge`/`StatusBadge`: mono 10.5–12px text with a 5–6px colored dot and no filled pill. Colors: active/running states use `--accent`, `succeeded` uses `--good`, queued/idle uses `--ink-3`, `failed` uses `--bad`.
- Metric groups: a grid with `gap-px bg-line border border-line`, where each cell is `bg-panel`.

## Step 6: Verify
- Run `make test`, `make smoke` and `npm run e2e`. Update the selectors in `e2e/control-center.spec.ts` if the nav labels change.
- Update the screenshots with `node scripts/screenshots.mjs`, and update PROGRESS.md and DECISIONS.md as the repo rules require.

## Prompt to give Claude Code
> Read design_handoff_nimbotics_ui/IMPLEMENTATION.md and README.md. Open Nimbotics.dc.html in a browser to see the target UI. Implement the redesign in frontend/ step by step (tokens → shell → landing + ParticleArm → each route), wiring all data to the existing backend APIs. Never use the prototype's placeholder numbers. Run the tests after each step.

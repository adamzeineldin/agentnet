import { TASK_TITLES, familyOf, type TaskTypeInfo } from "@/lib/tasks";

/** The library's state, all of it in the URL so any view, filter or open run can be shared as a link. */
export type LibraryView = "skills" | "runs" | "robots";
export type SkillOrigin = "all" | "own" | "learned";
export type RunResult = "all" | "running" | "succeeded" | "failed";

export interface LibraryQuery {
  view: LibraryView;
  /** Robot id, or null for every robot. In the Robots view it is the arm shown in detail. */
  robot: string | null;
  /** Task type (family), or null for every type. */
  task: string | null;
  /** One layout (scene id), set when following a skill to its runs or a run to its skill. */
  layout: string | null;
  /** Free-text search over task names, robots and routes. */
  q: string;
  origin: SkillOrigin;
  /** Run type (RUN_KIND key), or null for every type. */
  kind: string | null;
  result: RunResult;
  /** The run open in the dialog. */
  run: string | null;
}

const VIEWS: readonly LibraryView[] = ["skills", "runs", "robots"];
const ORIGINS: readonly SkillOrigin[] = ["all", "own", "learned"];
const RESULTS: readonly RunResult[] = ["all", "running", "succeeded", "failed"];

export function parseQuery(params: URLSearchParams): LibraryQuery {
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    view: pick(params.get("view"), VIEWS, "skills"),
    robot: params.get("robot"),
    task: params.get("task"),
    layout: params.get("layout"),
    q: params.get("q") ?? "",
    origin: pick(params.get("origin"), ORIGINS, "all"),
    kind: params.get("kind"),
    result: pick(params.get("result"), RESULTS, "all"),
    run: params.get("run"),
  };
}

/** Only non-default values go in the URL, so a plain /library link means "everything". */
export function queryString(q: LibraryQuery): string {
  const out = new URLSearchParams();
  if (q.view !== "skills") out.set("view", q.view);
  if (q.robot) out.set("robot", q.robot);
  if (q.task) out.set("task", q.task);
  if (q.layout) out.set("layout", q.layout);
  if (q.q.trim()) out.set("q", q.q);
  if (q.origin !== "all") out.set("origin", q.origin);
  if (q.kind) out.set("kind", q.kind);
  if (q.result !== "all") out.set("result", q.result);
  if (q.run) out.set("run", q.run);
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** A link into the library with only the given values set. */
export function libraryHref(patch: Partial<LibraryQuery> = {}): string {
  return `/library${queryString({ ...parseQuery(new URLSearchParams()), ...patch })}`;
}

/** "shelf_v1_s3" → "Reach onto a shelf"; designed task types read their title from /api/tasks. */
export function taskTypeTitle(family: string, tasks: TaskTypeInfo[] | null): string {
  return tasks?.find((t) => t.family === family)?.title ?? TASK_TITLES[family] ?? "Designed task";
}

/** "shelf_v1_s3" → "Reach onto a shelf · layout 3". */
export function layoutTitle(sceneId: string, tasks: TaskTypeInfo[] | null): string {
  const seed = sceneId.match(/_s(\d+)$/)?.[1];
  return `${taskTypeTitle(familyOf(sceneId), tasks)}${seed ? ` · layout ${seed}` : ""}`;
}

/** Case-insensitive match of every word in the search against any of the given texts. */
export function matchesSearch(search: string, texts: (string | null | undefined)[]): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

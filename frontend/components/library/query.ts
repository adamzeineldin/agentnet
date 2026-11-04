import { TASK_TITLES, familyOf, type TaskTypeInfo } from "@/lib/tasks";

/** The library's state, all of it in the URL so any view, filter or open run can be shared as a link. */
export type LibraryView = "skills" | "robots";
/** Skills known by several robots, or by just one. */
export type SkillSpread = "all" | "shared" | "single";
/** Newest first, or the most widely known (skills by robots that know them, robots by skills they know). */
export type LibrarySort = "newest" | "most";
/** Everything the viewer may see (public work plus their own private work), or only their own work. */
export type LibraryWho = "everyone" | "mine";

export interface LibraryQuery {
  view: LibraryView;
  /** Robot id, or null for every robot: skills a robot knows. */
  robot: string | null;
  /** Task type (family), or null for every type. */
  task: string | null;
  /** Free-text search over task names, robots and routes. */
  q: string;
  spread: SkillSpread;
  sort: LibrarySort;
  who: LibraryWho;
  /** The run open in the dialog (runs are reached from a skill or robot page). */
  run: string | null;
  /** The page open in the current view: a skill (scene id) in Skills, a robot id in Robots. */
  open: string | null;
}

const VIEWS: readonly LibraryView[] = ["skills", "robots"];
const SPREADS: readonly SkillSpread[] = ["all", "shared", "single"];
const SORTS: readonly LibrarySort[] = ["newest", "most"];
const WHOS: readonly LibraryWho[] = ["everyone", "mine"];

export function parseQuery(params: URLSearchParams): LibraryQuery {
  // Old links: a layout opens that skill; the retired Runs view falls back to Skills.
  const layout = params.get("layout");
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    view: pick(params.get("view"), VIEWS, "skills"),
    robot: params.get("robot"),
    task: params.get("task"),
    q: params.get("q") ?? "",
    spread: pick(params.get("spread"), SPREADS, "all"),
    sort: pick(params.get("sort"), SORTS, "newest"),
    who: pick(params.get("who"), WHOS, "everyone"),
    run: params.get("run"),
    open: params.get("open") ?? layout,
  };
}

/** Only non-default values go in the URL, so a plain /library link means "everything". */
export function queryString(q: LibraryQuery): string {
  const out = new URLSearchParams();
  if (q.view !== "skills") out.set("view", q.view);
  if (q.robot) out.set("robot", q.robot);
  if (q.task) out.set("task", q.task);
  if (q.q.trim()) out.set("q", q.q);
  if (q.spread !== "all") out.set("spread", q.spread);
  if (q.sort !== "newest") out.set("sort", q.sort);
  if (q.who !== "everyone") out.set("who", q.who);
  if (q.run) out.set("run", q.run);
  if (q.open) out.set("open", q.open);
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

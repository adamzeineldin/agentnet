import type { ExperienceCapsule } from "@/lib/types";

const ROUTE: Record<string, string> = {
  direct: "Straight line", over: "Over the wall", near_side: "Around the near side", far_side: "Around the far side",
};

/** "Over the wall, 8 cm clear · layout 42" — how a skill is named to people; the id stays in tooltips. */
export function skillName(s: Pick<ExperienceCapsule, "strategy" | "task">): string {
  const cm = Math.round(s.strategy.clearance_m * 100);
  return `${ROUTE[s.strategy.route_class] ?? s.strategy.route_class}${cm ? `, ${cm} cm clear` : ""} · layout ${s.task.seed}`;
}

export const routeName = (routeClass: string): string => ROUTE[routeClass] ?? routeClass;

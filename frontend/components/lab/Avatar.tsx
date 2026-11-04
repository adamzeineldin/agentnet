import { apiUrl } from "@/lib/api";
import type { RobotSummary } from "@/lib/types";

const SIZES = { sm: "size-7", md: "size-10" } as const;

/** A robot's home-pose render in a circle, as the Library shows robots. */
export function Avatar({ robot, size = "sm" }: { robot: RobotSummary | undefined; size?: keyof typeof SIZES }) {
  const cls = `${SIZES[size]} shrink-0 rounded-full bg-panel-2 object-cover`;
  if (!robot) return <span aria-hidden="true" className={cls} />;
  // eslint-disable-next-line @next/next/no-img-element -- rendered by the backend from the loaded model
  return <img src={apiUrl(robot.snapshot_url)} alt="" title={robot.short_name} className={cls} />;
}

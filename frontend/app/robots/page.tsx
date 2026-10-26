import { Suspense } from "react";
import { RobotFleet } from "@/components/RobotFleet";
import { Loading } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<Loading label="Loading fleet…" />}>
      <RobotFleet />
    </Suspense>
  );
}

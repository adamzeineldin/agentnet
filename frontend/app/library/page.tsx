import { Suspense } from "react";
import { Library } from "@/components/library/Library";
import { Loading } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<Loading label="Loading the library…" />}><Library /></Suspense>;
}

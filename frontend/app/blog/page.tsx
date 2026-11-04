import { Suspense } from "react";
import { Blog } from "@/components/blog/Blog";
import { Loading } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<Loading label="Loading the blog…" />}><Blog /></Suspense>;
}

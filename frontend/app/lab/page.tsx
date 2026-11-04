import { Suspense } from "react";
import { Lab } from "@/components/lab/Lab";
import { Loading } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<Loading label="Loading the Lab…" />}><Lab /></Suspense>;
}

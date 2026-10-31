import { Suspense } from "react";
import { SkillLibrary } from "@/components/SkillLibrary";
import { Loading } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<Loading />}><SkillLibrary /></Suspense>;
}

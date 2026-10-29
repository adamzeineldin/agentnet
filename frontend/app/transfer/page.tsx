import { Suspense } from "react";
import { TransferLab } from "@/components/TransferLab";
import { Loading } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<Loading label="Loading transfer lab…" />}><TransferLab /></Suspense>;
}

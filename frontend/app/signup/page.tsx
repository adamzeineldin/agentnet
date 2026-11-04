import { Suspense } from "react";
import { SignUpPage } from "@/components/auth/AuthPages";

export const metadata = { title: "Create your account · Nimbotics" };

export default function Page() {
  return <Suspense><SignUpPage /></Suspense>;
}

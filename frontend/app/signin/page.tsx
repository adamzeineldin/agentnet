import { Suspense } from "react";
import { SignInPage } from "@/components/auth/AuthPages";

export const metadata = { title: "Log in · Nimbotics" };

export default function Page() {
  return <Suspense><SignInPage /></Suspense>;
}

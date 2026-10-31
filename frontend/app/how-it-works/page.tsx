"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How it works moved onto the home page; keep old links working. */
export default function Page() {
  const router = useRouter();
  useEffect(() => router.replace("/#how-it-works"), [router]);
  return null;
}

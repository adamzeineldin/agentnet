import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", weight: ["300", "400", "500", "600"], subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AgentNet Control Center",
  description: "Simulation-verified robot experience sharing across embodiments",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try { document.documentElement.dataset.theme = localStorage.getItem('agentnet-theme') === 'dark' ? 'dark' : 'light'; } catch {}` }} />
      </head>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

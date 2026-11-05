import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Red Thread Autoreply",
  description: "Comment-to-DM automation for Red Thread",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/triggers", label: "Automations" },
  { href: "/flows", label: "Flows" },
  { href: "/stats", label: "Stats" },
  { href: "/comments", label: "Comment log" },
  { href: "/ice-breakers", label: "Ice breakers" },
  { href: "/packages", label: "Packages" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <span className="font-semibold text-red-700">red thread · autoreply</span>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-neutral-600 hover:text-neutral-900">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

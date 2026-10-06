import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { APP_NAME, BUSINESS_NAME } from "@/lib/config";
import { BottomNav, TopNav } from "@/components/Nav";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Predict food waste before you buy, and send what's left to black soldier fly farms.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f4d36",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <header className="no-print sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4 px-4 py-3 md:max-w-5xl">
            <Link href="/log" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
                {APP_NAME.slice(0, 1)}
              </span>
              <span className="leading-tight">
                <span className="block font-semibold">{APP_NAME}</span>
                <span className="block text-xs text-muted">{BUSINESS_NAME}</span>
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <TopNav />
              {/* The landing page at "/" is static HTML (public/larvaloop), outside the app router. */}
              <a href="/" className="text-sm font-medium text-muted hover:text-ink">
                About LarvaLoop
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-md px-4 pb-32 pt-4 md:max-w-5xl md:pb-12">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}

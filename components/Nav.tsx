"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Leaf, Plus, ShoppingCart } from "lucide-react";

// The BSF page has no tab; it opens from the "Next BSF pickup" tile on Insights.
// "/" is the LarvaLoop landing page, outside the app.
const NAV = [
  { href: "/log", label: "Log waste", icon: Plus },
  { href: "/insights", label: "Insights", icon: LayoutDashboard },
  { href: "/order", label: "Smart order", icon: ShoppingCart },
  { href: "/esg", label: "ESG", icon: Leaf },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path.startsWith(href);
}

export function TopNav() {
  const isActive = useActive();
  return (
    <nav className="hidden md:flex items-center gap-1">
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            isActive(href) ? "bg-brand text-white" : "text-muted hover:bg-black/5 hover:text-ink"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useActive();
  return (
    <nav className="no-print md:hidden fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          if (href === "/log") {
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-white shadow-sm ${
                      active ? "bg-brand-strong" : "bg-brand"
                    }`}
                  >
                    <Icon size={18} strokeWidth={2.6} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

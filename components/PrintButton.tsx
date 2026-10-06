"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white"
    >
      <Printer size={16} /> {label}
    </button>
  );
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Card({ className = "", id, children }: { className?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="flex shrink-0 items-center text-sm font-medium text-brand">
          {linkLabel ?? "View"}
          <ChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="num mt-0.5 text-xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pctDone = Math.min(100, (value / max) * 100);
  return (
    <div className="h-3 overflow-hidden rounded-full bg-brand-soft" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pctDone}%` }} />
    </div>
  );
}

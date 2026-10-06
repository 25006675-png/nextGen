import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Recycle } from "lucide-react";
import { getDashboard, getDataSources } from "@/lib/queries";
import { BSF_PICKUP_THRESHOLD_KG, REASON_LABELS } from "@/lib/config";
import { dayKey, daysBetween, shortDate } from "@/lib/dates";
import { kg, pct, rm } from "@/lib/format";
import { Card, CardHeader, Progress, Stat } from "@/components/ui";
import { ForecastChart } from "@/components/ForecastChart";
import { UseFirst } from "@/components/UseFirst";

export const dynamic = "force-dynamic";

type Sources = Awaited<ReturnType<typeof getDataSources>>;

/** Where the numbers come from: ERP and POS sync on their own, waste is logged on a phone. */
function DataSources({ s, today }: { s: Sources; today: string }) {
  const salesDays = s.salesFrom && s.salesTo ? daysBetween(s.salesFrom, s.salesTo) + 1 : 0;
  const last = s.lastWasteLog;
  const lastLog = last
    ? `${dayKey(last) === today ? "today" : shortDate(dayKey(last))} ${last.toLocaleTimeString("en-MY", {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "none yet";
  const sources = [
    {
      name: "ERP",
      what: "Purchases, stock",
      mode: "Auto-sync",
      detail: `${s.purchases.toLocaleString("en-MY")} purchase lines`,
      when: s.lastPurchase ? `last ${shortDate(s.lastPurchase)}` : "none yet",
    },
    {
      name: "POS",
      what: "Sales",
      mode: "Auto-sync",
      detail: `${salesDays} days of sales`,
      when: `${s.items} items tracked`,
    },
    {
      name: "Waste log",
      what: "Phone, by staff",
      mode: "Manual",
      detail: `${s.wasteLogs.toLocaleString("en-MY")} entries`,
      when: `latest ${lastLog}`,
    },
  ];

  return (
    <Card className="p-3 md:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Data sources</h2>
        <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
          Demo data · simulated 90 days
        </span>
      </div>
      <ul className="grid grid-cols-3 divide-x divide-line">
        {sources.map((src) => (
          <li key={src.name} className="min-w-0 px-2 first:pl-1 md:px-4 md:first:pl-1">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              <span className="truncate text-sm font-semibold">{src.name}</span>
              <span className="hidden text-xs text-muted md:inline">· {src.mode}</span>
            </div>
            <div className="text-xs text-muted">{src.what}</div>
            <div className="num mt-1 text-xs text-ink/80">
              {src.detail}
              <span className="block text-muted md:inline"><span className="hidden md:inline"> · </span>{src.when}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function Dashboard() {
  const [d, sources] = await Promise.all([getDashboard(), getDataSources()]);
  const change = d.prevRM > 0 ? (d.lostRM - d.prevRM) / d.prevRM : 0;
  const maxTop = Math.max(...d.topWasted.map((t) => t.rm), 1);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DataSources s={sources} today={d.today} />

      {/* Money first */}
      <Card className="border-loss/20 bg-loss-soft md:col-span-2">
        <div className="text-sm font-medium text-loss">Lost to food waste · last 30 days</div>
        <div className="num mt-1 text-5xl font-extrabold tracking-tight text-loss">{rm(d.lostRM)}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/80">
          <span>{kg(d.lostKg)} of food thrown away</span>
          {d.prevRM > 0 && (
            <span className={`inline-flex items-center gap-0.5 font-medium ${change > 0 ? "text-loss" : "text-brand"}`}>
              {change > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              {pct(Math.abs(change))} vs previous 30 days
            </span>
          )}
        </div>
      </Card>

      {/* Waste forecast -> action, next to the weekly history it extends */}
      <Card className="md:col-span-2">
        <CardHeader
          title="Waste forecast"
          subtitle="Average week over the next 4 weeks, from 200 simulated futures"
        />
        <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-canvas p-3">
                <Stat label="Usual orders" value={`~${rm(d.forecastUsualRM)}`} hint="waste / avg week" />
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <Stat label="Smart order" value={`~${rm(d.forecastSmartRM)}`} hint="waste / avg week" />
              </div>
            </div>
            {d.forecastSavingRM > 1 && (
              <Link
                href="/order"
                className="flex items-center justify-between gap-3 rounded-xl bg-brand px-4 py-3 text-white transition-colors hover:bg-brand-strong"
              >
                <span>
                  <span className="block text-sm opacity-90">Follow the smart order and save</span>
                  <span className="num block text-xl font-bold">~{rm(d.forecastSavingRM)} / week</span>
                  <span className="block text-xs opacity-80">net of extra sell-outs</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
                  See order <ArrowRight size={16} />
                </span>
              </Link>
            )}
            <p className="text-xs text-muted">
              Forecast accuracy: within ±{pct(d.forecastError)} of actual daily use on average (tested on the last 4
              weeks).
              {d.upcoming.length > 0 && ` Adjusted for: ${d.upcoming.join(", ")}.`}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Weekly waste (RM)</h3>
            <p className="mb-2 text-xs text-muted">Last 8 weeks logged, then the average week ahead</p>
            <ForecastChart data={d.weekly} />
          </div>
        </div>
      </Card>

      {/* Use-first alerts with their Monte Carlo futures */}
      <Card className="md:col-span-2">
        <CardHeader title="Use first" subtitle="Stock likely to expire before it's used, from 1,000 simulated futures each" />
        <UseFirst alerts={d.alerts} today={d.today} />
      </Card>

      {/* Where the money leaks */}
      <Card>
        <CardHeader title="Top wasted items" subtitle="Last 30 days, by money lost" />
        <ol className="space-y-3">
          {d.topWasted.map((t, i) => (
            <li key={t.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  <span className="num mr-2 text-muted">{i + 1}</span>
                  {t.name}
                </span>
                <span className="num font-semibold">{rm(t.rm)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-canvas">
                <div className="h-full rounded-full bg-loss/80" style={{ width: `${(t.rm / maxTop) * 100}%` }} />
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {kg(t.kg)} · mostly {REASON_LABELS[t.topReason].toLowerCase()}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {/* ESG + BSF */}
      <Card>
        <CardHeader title="Impact (ESG)" subtitle="Waste sent to BSF farms instead of landfill" href="/esg" linkLabel="Report" />
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Diverted" value={kg(d.esg.kg)} hint={`${kg(d.esg.thisMonthKg)} this month`} />
          <Stat label="CO₂e avoided" value={kg(d.esg.co2)} hint={`${d.esg.pickups} pickups so far`} />
        </div>
        <Link href="/bsf" className="mt-4 block rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Recycle size={16} className="text-brand" /> Next BSF pickup
            </span>
            {d.bsf.kg >= BSF_PICKUP_THRESHOLD_KG ? (
              <span className="num font-semibold text-brand">{kg(d.bsf.kg)} · ready for pickup</span>
            ) : (
              <span className="num text-muted">
                {kg(d.bsf.kg)} / {BSF_PICKUP_THRESHOLD_KG} kg
              </span>
            )}
          </div>
          <Progress value={d.bsf.kg} max={BSF_PICKUP_THRESHOLD_KG} />
        </Link>
      </Card>
    </div>
  );
}

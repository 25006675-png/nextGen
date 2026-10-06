import Link from "next/link";
import { FileText } from "lucide-react";
import { getEsgReport } from "@/lib/esg-report";
import { APP_NAME, BSF_PARTNER_FARM, CO2E_PER_KG_DIVERTED, ESG_TARGETS, FRASS_YIELD } from "@/lib/config";
import { kg, pct, rm } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui";
import { EsgChart, EsgLegend } from "@/components/EsgChart";
import { EsgKpi } from "@/components/EsgKpi";

export const dynamic = "force-dynamic";

const per100 = (x: number) => `${(x * 100).toFixed(1)} kg`;

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <dt className="text-muted">
        {label}
        {note && <span className="block text-xs">{note}</span>}
      </dt>
      <dd className="num shrink-0 text-right font-semibold">{value}</dd>
    </div>
  );
}

export default async function EsgPage() {
  const r = await getEsgReport();
  const e = r.environment;
  const c = r.comparison;
  const farms = r.social.partnerFarms;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ESG</h1>
          <p className="mt-0.5 text-sm text-muted">
            Food waste and BSF diversion · {r.period.span} ·{" "}
            <span className="whitespace-nowrap">{r.period.range}</span>
          </p>
        </div>
        <Link
          href="/esg/report"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          <FileText size={16} /> Open full report
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <EsgKpi label="Diverted from landfill" value={kg(e.divertedKg)} hint={`whole period · ${r.governance.batches} BSF pickups`} />
        <EsgKpi label="CO₂e avoided (est.)" value={kg(e.co2Kg)} hint={`whole period · assumed ${CO2E_PER_KG_DIVERTED} kg/kg`} />
        <EsgKpi label="Diversion rate" value={pct(e.diversionRate)} hint={`whole period · of ${kg(e.generatedKg)}`} />
        {c ? (
          <EsgKpi
            label="Waste per 100 kg bought"
            value={per100(c.current.intensity)}
            change={c.baseline.intensity > 0 ? c.current.intensity / c.baseline.intensity - 1 : undefined}
            lowerIsBetter
            hint="last 30 days"
          />
        ) : (
          <EsgKpi label="Waste per 100 kg bought" value={per100(e.intensity)} hint="whole period" />
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader title="Where food waste went" subtitle="kg logged each month" />
          <EsgLegend />
          <div className="mt-3">
            <EsgChart data={r.monthly} />
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 text-right font-medium">Waste</th>
                <th className="py-1 text-right font-medium">To BSF</th>
                <th className="py-1 text-right font-medium">Per 100 kg bought</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {r.monthly.map((m) => (
                <tr key={m.key}>
                  <td className="py-1.5">
                    {m.label}
                    {m.partial && "*"}
                  </td>
                  <td className="py-1.5 text-right">{kg(m.generatedKg)}</td>
                  <td className="py-1.5 text-right">{kg(m.divertedKg)}</td>
                  <td className="py-1.5 text-right">{per100(m.intensity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">* Part month. Waste logged recently may still be awaiting pickup.</p>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="BSF partnership" subtitle={farms.join(", ") || BSF_PARTNER_FARM} />
            <dl className="divide-y divide-line">
              <Row label="Pickups collected" value={String(r.governance.batches)} />
              <Row label="Frass returned (est.)" value={kg(r.social.frassKg)} />
              <Row label="Credit earned (est.)" value={rm(r.social.creditRM, 2)} />
            </dl>
          </Card>
          <Card>
            <CardHeader title="Data quality" subtitle="How well the figures can be checked" />
            <dl className="divide-y divide-line">
              <Row label="Pickups traceable to waste logs" value={pct(r.governance.traceableRate)} />
              <Row label="BSF waste assigned to a pickup" value={pct(r.governance.linkedRate)} />
              {r.governance.photoRate > 0 ? (
                <Row label="Waste logs with a photo" value={pct(r.governance.photoRate)} />
              ) : (
                <Row
                  label="Photo evidence"
                  note={`Photo capture added to the waste log this period · target ${pct(ESG_TARGETS.photoEvidence)}`}
                  value="Not yet collected"
                />
              )}
            </dl>
          </Card>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted">
        Simulated demo data. Headline figures cover the whole period, the shop&apos;s baseline on its fixed ordering
        habit before following {APP_NAME}&apos;s recommendations; waste per 100 kg bought compares the last 30 days with
        the first 30 days. Only waste collected by a BSF partner counts as diverted. CO₂e avoided uses an assumed{" "}
        {CO2E_PER_KG_DIVERTED} kg CO₂e per kg kept out of landfill; frass is estimated at {FRASS_YIELD * 100}% of
        feedstock mass. Both are to be replaced with verified figures.
      </p>
    </div>
  );
}

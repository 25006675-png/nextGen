import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import "./report.css";
import { getEsgOutlook, getEsgReport } from "@/lib/esg-report";
import { getDataSources } from "@/lib/queries";
import { dayKey, parseDay, todayKey } from "@/lib/dates";
import {
  APP_NAME,
  BSF_CREDIT_PER_KG,
  BUSINESS_NAME,
  CO2E_PER_KG_DIVERTED,
  ESG_TARGETS,
  FRASS_YIELD,
  LOST_SALE_MULT,
  REASONS,
  REASON_LABELS,
} from "@/lib/config";
import { kg, pct, rm } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import { EsgKpi } from "@/components/EsgKpi";
import { ESG_SERIES } from "@/components/EsgSeries";

export const dynamic = "force-dynamic";

type Basis = "Recorded" | "Estimated" | "Assumption" | "Projection";

const BASIS_STYLE: Record<Basis, string> = {
  Recorded: "bg-brand-soft text-brand-strong",
  Estimated: "bg-warn-soft text-warn",
  Assumption: "bg-black/5 text-muted",
  Projection: "border border-line text-muted",
};

const longDate = (key: string) =>
  parseDay(key).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
const per100 = (x: number) => `${(x * 100).toFixed(1)} kg`;
// One decimal, so a rate just under its target never reads as equal to it.
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Chip({ basis }: { basis: Basis }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${BASIS_STYLE[basis]}`}>
      {basis}
    </span>
  );
}

function Section({
  n,
  title,
  gri,
  className = "",
  children,
}: {
  n: number;
  title: string;
  gri?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`border-t border-line pt-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold tracking-tight">
          <span className="mr-2 text-brand">{n}</span>
          {title}
        </h2>
        {gri && <span className="text-xs text-muted">{gri}</span>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// A subsection is kept on one printed page.
function Sub({ title, gri, children }: { title: string; gri?: string; children: React.ReactNode }) {
  return (
    <div className="keep">
      <h3 className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
        {title}
        {gri && <span className="text-xs font-normal text-muted">{gri}</span>}
      </h3>
      {children}
    </div>
  );
}

type Row = { label: string; note?: string; value: string; basis?: Basis };

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map((r) => (
        <div key={r.label} className="keep flex items-start justify-between gap-4 py-2.5">
          <dt className="min-w-0 text-sm">
            {r.label}
            {r.note && <div className="text-xs text-muted">{r.note}</div>}
          </dt>
          <dd className="shrink-0 text-right">
            <div className="num text-sm font-semibold">{r.value}</div>
            {r.basis && <Chip basis={r.basis} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const th = "py-1.5 text-xs font-medium text-muted";

export default async function EsgReportPage() {
  const today = todayKey();
  const [r, outlook, src] = await Promise.all([getEsgReport(today), getEsgOutlook(today), getDataSources()]);
  const e = r.environment;
  const c = r.comparison;
  const period = `${longDate(r.from)} to ${longDate(r.to)}`;
  const photosStarted = r.governance.photoRate > 0;
  const farms = r.social.partnerFarms.join(", ") || "None yet";
  const share = (x: number) => (e.generatedKg > 0 ? pct(x / e.generatedKg) : "0%");
  const change = c && c.baseline.intensity > 0 ? c.current.intensity / c.baseline.intensity - 1 : undefined;

  const destination = [
    { ...ESG_SERIES[0], kg: e.divertedKg },
    { ...ESG_SERIES[1], kg: e.awaitingKg },
    { ...ESG_SERIES[2], kg: e.disposalKg },
  ];

  const targets = c
    ? [
        {
          label: "Waste per 100 kg bought",
          baseline: per100(c.baseline.intensity),
          current: per100(c.current.intensity),
          target: `≤ ${per100(c.baseline.intensity * (1 - ESG_TARGETS.wasteReduction))}`,
          met: c.current.intensity <= c.baseline.intensity * (1 - ESG_TARGETS.wasteReduction),
          note: `${pct(ESG_TARGETS.wasteReduction)} below first 30 days`,
        },
        {
          label: "Diversion rate",
          baseline: pct1(c.baseline.diversionRate),
          current: pct1(c.current.diversionRate),
          target: `≥ ${pct(ESG_TARGETS.diversionRate)}`,
          met: c.current.diversionRate >= ESG_TARGETS.diversionRate,
        },
        {
          label: "Waste logs with a photo",
          baseline: photosStarted ? pct1(c.baseline.photoRate) : "—",
          current: photosStarted ? pct1(c.current.photoRate) : "Not yet collected",
          target: `≥ ${pct(ESG_TARGETS.photoEvidence)}`,
          met: c.current.photoRate >= ESG_TARGETS.photoEvidence,
          isNew: !photosStarted,
        },
      ]
    : [];

  return (
    <div className="esg-report mx-auto max-w-3xl">
      <div className="no-print mb-3 flex items-center justify-between gap-3">
        <Link href="/esg" className="flex items-center text-sm font-medium text-brand">
          <ChevronLeft size={16} /> ESG summary
        </Link>
        <PrintButton label="Print or save PDF" />
      </div>

      <article className="space-y-8 rounded-2xl border border-line bg-surface p-5 sm:p-8 print:rounded-none print:border-0 print:p-0">
        {/* Cover */}
        <header>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-bold text-white">
                {APP_NAME.slice(0, 1)}
              </span>
              {APP_NAME}
            </div>
            <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">Simulated demo data</span>
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-brand">ESG report · Food waste</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{BUSINESS_NAME}</h1>
          <p className="mt-1 text-muted">
            {r.period.span} · <span className="whitespace-nowrap">{r.period.range}</span>
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-canvas p-4 text-sm sm:grid-cols-3">
            {(
              [
                ["Organisation", "Food & beverage SME, 1 outlet, Malaysia (legal form to be confirmed)"],
                [
                  "Reporting period",
                  <>
                    {r.period.span}
                    <span className="block">
                      <span className="whitespace-nowrap">{r.period.fromLabel} –</span>{" "}
                      <span className="whitespace-nowrap">{r.period.toLabel}</span>
                    </span>
                  </>,
                ],
                ["Prepared on", longDate(today)],
                ["Prepared with", `${APP_NAME}, from shop records`],
                ["Reporting basis", "With reference to GRI 306: Waste 2020"],
                ["External assurance", "None"],
              ] as [string, React.ReactNode][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <Section n={1} title="Executive summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <EsgKpi className="keep" label="Diverted from landfill" value={kg(e.divertedKg)} hint="whole period · to a BSF farm" />
            <EsgKpi className="keep" label="CO₂e avoided (est.)" value={kg(e.co2Kg)} hint="whole period" />
            <EsgKpi className="keep" label="Diversion rate" value={pct(e.diversionRate)} hint={`whole period · of ${kg(e.generatedKg)}`} />
            <EsgKpi
              className="keep"
              label="Waste per 100 kg bought"
              value={per100(c ? c.current.intensity : e.intensity)}
              change={change}
              lowerIsBetter
              hint={c ? "last 30 days" : "whole period"}
            />
          </div>
          <p className="text-sm leading-relaxed">
            Over the period, {BUSINESS_NAME} logged {kg(e.generatedKg)} of food waste, worth {rm(e.generatedRM)} at
            cost. {pct(e.diversionRate)} of it ({kg(e.divertedKg)}) was collected by a black soldier fly (BSF) farm and
            turned into insect feed and fertiliser instead of going to landfill, avoiding an estimated {kg(e.co2Kg)} CO₂e.
          </p>
          <p className="text-sm leading-relaxed">
            This period is the shop&apos;s baseline: it reordered by a fixed weekly habit, before using {APP_NAME}&apos;s
            order recommendations.
            {c && (
              <>
                {" "}
                Waste per 100 kg of ingredients bought rose from {per100(c.baseline.intensity)} in the first 30 days to{" "}
                {per100(c.current.intensity)} in the last 30 days: fixed orders did not follow demand, which is the problem{" "}
                {APP_NAME} addresses.
              </>
            )}{" "}
            From the next period the shop will follow {APP_NAME}&apos;s smart order
            {outlook.weeklyNetSavingRM > 0
              ? `, which the stock simulation projects to save about ${rm(outlook.weeklyNetSavingRM)} a week net (projection, see section 5).`
              : " (see section 5)."}
          </p>
        </Section>

        <Section n={2} title="Environmental" gri="GRI 306-1 to 306-5, 305-5" className="print:break-before-page">
          <Sub title="Impact and approach" gri="306-1, 306-2">
            <p className="text-sm leading-relaxed">
              The main impact is purchased food that is thrown away, mostly perishables bought in larger amounts than
              are used. During this period the shop reordered the same quantities each week by habit, whatever the
              demand; this is the baseline before {APP_NAME}&apos;s recommendations. Older stock is used first, clean food
              waste (expired, spoiled, trimmings) goes to BSF farms, and cooked leftovers go to general waste. Next, the
              shop will order the quantities {APP_NAME} recommends from its sales forecast (section 5).
            </p>
          </Sub>

          <Sub title="Waste generated" gri="306-3">
            <div className="grid gap-5 sm:grid-cols-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className={th}>By food type</th>
                    <th className={`${th} text-right`}>kg</th>
                    <th className={`${th} text-right`}>Share</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {e.byCategory.map((x) => (
                    <tr key={x.category}>
                      <td className="py-1.5">{cap(x.category)}</td>
                      <td className="py-1.5 text-right">{kg(x.kg)}</td>
                      <td className="py-1.5 text-right text-muted">{share(x.kg)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="py-1.5 text-right">{kg(e.generatedKg)}</td>
                    <td className="py-1.5 text-right">100%</td>
                  </tr>
                </tbody>
              </table>
              <table className="w-full self-start text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className={th}>By cause</th>
                    <th className={`${th} text-right`}>kg</th>
                    <th className={`${th} text-right`}>Cost</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {REASONS.map((reason) => (
                    <tr key={reason}>
                      <td className="py-1.5">{REASON_LABELS[reason]}</td>
                      <td className="py-1.5 text-right">{kg(e.byReason[reason].kg)}</td>
                      <td className="py-1.5 text-right text-muted">{rm(e.byReason[reason].rm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              All food waste is non-hazardous. Source: {r.logCount} waste log entries.
            </p>
          </Sub>

          <Sub title="Where the waste went" gri="306-4, 306-5">
            <div className="keep mb-3 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {destination.map((d) => (
                <div key={d.key} style={{ width: `${(d.kg / (e.generatedKg || 1)) * 100}%`, background: d.color }} />
              ))}
            </div>
            <Rows
              rows={[
                {
                  label: "Diverted from disposal",
                  note: "Recycling by BSF bioconversion, off-site (GRI 306-4)",
                  value: `${kg(e.divertedKg)} · ${share(e.divertedKg)}`,
                  basis: "Recorded",
                },
                {
                  label: "Directed to disposal",
                  note: "General waste, landfill assumed, off-site (GRI 306-5)",
                  value: `${kg(e.disposalKg)} · ${share(e.disposalKg)}`,
                  basis: "Recorded",
                },
                {
                  label: "Held on site, awaiting BSF pickup",
                  note: "Not yet diverted or disposed",
                  value: `${kg(e.awaitingKg)} · ${share(e.awaitingKg)}`,
                  basis: "Recorded",
                },
              ]}
            />
          </Sub>

          <Sub title="Emissions avoided" gri="305-5">
            <Rows
              rows={[
                {
                  label: "GHG emissions avoided",
                  note: `${kg(e.divertedKg)} diverted × ${CO2E_PER_KG_DIVERTED} kg CO₂e per kg (assumed factor, see section 6)`,
                  value: `${kg(e.co2Kg)} CO₂e`,
                  basis: "Estimated",
                },
              ]}
            />
          </Sub>

          <Sub title="Waste intensity">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className={th}>Month</th>
                  <th className={`${th} text-right`}>Waste</th>
                  <th className={`${th} text-right`}>Bought</th>
                  <th className={`${th} text-right`}>Per 100 kg</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {r.monthly.map((m) => (
                  <tr key={m.key}>
                    <td className="py-1.5">
                      {m.label}
                      {m.partial && <span className="text-muted"> (part)</span>}
                    </td>
                    <td className="py-1.5 text-right">{kg(m.generatedKg)}</td>
                    <td className="py-1.5 text-right">{kg(m.boughtKg)}</td>
                    <td className="py-1.5 text-right font-semibold">{per100(m.intensity)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-semibold">
                  <td className="py-1.5">Whole period</td>
                  <td className="py-1.5 text-right">{kg(e.generatedKg)}</td>
                  <td className="py-1.5 text-right">{kg(e.purchasedKg)}</td>
                  <td className="py-1.5 text-right">{per100(e.intensity)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Kg of food wasted per 100 kg of ingredients bought, so a busier month does not look worse.
              {c && ` First 30 days of records: ${per100(c.baseline.intensity)}. Last 30 days: ${per100(c.current.intensity)}.`}
            </p>
            <p className="mt-1 text-xs text-muted">
              Why it rises: the whole period ran on the shop&apos;s fixed ordering habit (the baseline). Public holidays and
              the school holidays in August and September lowered demand while orders stayed the same, so more of each kg
              bought was wasted.
            </p>
          </Sub>
        </Section>

        <Section n={3} title="Social">
          <p className="text-sm leading-relaxed">
            Waste is collected by a local BSF farm. Larvae turn it into insect protein for animal feed and frass, an
            organic fertiliser. Frass comes back to the business for its own or a community garden; otherwise the farm
            pays a small credit per kg.
          </p>
          <Rows
            rows={[
              { label: "BSF partner farms", note: farms, value: String(r.social.partnerFarms.length), basis: "Recorded" },
              {
                label: "Frass fertiliser returned",
                note: `${r.social.frassBatches} pickups taken as frass, at ${FRASS_YIELD * 100}% of feedstock mass`,
                value: kg(r.social.frassKg),
                basis: "Estimated",
              },
              {
                label: "Credit due from farm",
                note: `${r.governance.batches - r.social.frassBatches} pickups taken as credit: kg collected × ${rm(BSF_CREDIT_PER_KG, 2)} per kg contract rate, not a recorded payment`,
                value: rm(r.social.creditRM, 2),
                basis: "Estimated",
              },
            ]}
          />
          <p className="text-xs text-muted">Not yet tracked: staff training on sorting, and safety incidents in waste handling.</p>
        </Section>

        <Section n={4} title="Governance and data quality">
          <p className="text-sm leading-relaxed">
            Every BSF pickup has a batch code that links it to the waste logs it came from (item, reason, date), so each
            kilogram diverted can be traced back to a record.
          </p>
          <Sub title="Traceability and evidence">
            <Rows
              rows={[
                { label: "Pickups fully traceable", note: "Batch code and linked waste logs", value: pct(r.governance.traceableRate), basis: "Recorded" },
                { label: "BSF-eligible waste assigned to a pickup", note: "The rest is awaiting the next pickup", value: pct(r.governance.linkedRate), basis: "Recorded" },
                photosStarted
                  ? { label: "Waste logs with photo evidence", note: "Photo taken at the bin when logging", value: pct(r.governance.photoRate), basis: "Recorded" }
                  : {
                      label: "Photo evidence",
                      note: `Photo capture was added to the waste log this period; target ${pct(ESG_TARGETS.photoEvidence)} of logs`,
                      value: "Not yet collected",
                    },
              ]}
            />
          </Sub>
          <Sub title="Data sources">
            <Rows
              rows={[
                {
                  label: "Sales (POS)",
                  note: `Synced automatically${src.salesFrom && src.salesTo ? `, ${longDate(src.salesFrom)} to ${longDate(src.salesTo)}` : ""}`,
                  value: `${src.salesRows.toLocaleString("en-MY")} records`,
                },
                {
                  label: "Purchases and stock (ERP)",
                  note: `Synced automatically${src.lastPurchase ? `, last delivery ${longDate(src.lastPurchase)}` : ""}`,
                  value: `${src.purchases.toLocaleString("en-MY")} records`,
                },
                {
                  label: "Food waste (staff phone log)",
                  note: `Logged by hand${src.lastWasteLog ? `, last entry ${longDate(dayKey(src.lastWasteLog))}` : ""}`,
                  value: `${src.wasteLogs.toLocaleString("en-MY")} records`,
                },
                {
                  label: "BSF pickups (partner farm)",
                  note: "Confirmed at collection, with batch code",
                  value: `${r.governance.batches} records`,
                },
              ]}
            />
          </Sub>
        </Section>

        <Section n={5} title="Targets">
          {c ? (
            <>
              <div className="divide-y divide-line border-y border-line">
                {targets.map((t) => (
                  <div key={t.label} className="keep py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{t.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          t.met ? "bg-brand-soft text-brand-strong" : "bg-black/5 text-muted"
                        }`}
                      >
                        {t.met ? "✓ Met" : "isNew" in t && t.isNew ? "New measure" : "Not yet met"}
                      </span>
                    </div>
                    <dl className="num mt-1.5 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted">First 30 days</dt>
                        <dd>{t.baseline}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Last 30 days</dt>
                        <dd className="font-semibold">{t.current}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">
                          Target<span className="hidden sm:inline">, next period</span>
                        </dt>
                        <dd>
                          {t.target}
                          {t.note && <span className="block text-xs text-muted">{t.note}</span>}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">
                Target rates use the last 30 days of records (from {longDate(c.currentFrom)}), compared with the first
                30 days (from {longDate(c.baselineFrom)}); headline figures in sections 1 to 3 cover the whole period.
                Targets are for the next period, when the shop follows {APP_NAME}&apos;s recommendations, and are set by
                the business.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">At least 60 days of records are needed to compare a baseline with now.</p>
          )}
          <div className="keep rounded-xl bg-canvas p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">How we plan to get there</h3>
              <Chip basis="Projection" />
            </div>
            <p className="mt-1 leading-relaxed">
              Replace the fixed weekly habit used this period with {APP_NAME}&apos;s smart order, which sets each
              item&apos;s quantity from the sales forecast. In the stock simulation (next 4 weeks), expected food waste
              falls from about {rm(outlook.weeklyWasteUsualRM)} a week on the habit to {rm(outlook.weeklyWasteSmartRM)}{" "}
              on the smart order. After counting sales lost to running out, the net{" "}
              {outlook.weeklyNetSavingRM >= 0 ? "saving" : "cost"} is about {rm(Math.abs(outlook.weeklyNetSavingRM))} a
              week. This is a projection, not a record.
            </p>
          </div>
        </Section>

        <Section n={6} title="Methodology and assumptions">
          <Sub title="Assumptions">
            <Rows
              rows={[
                {
                  label: "CO₂e avoided per kg diverted",
                  note: "Just below US EPA WARM v16 for landfilled food waste (0.55 kg/kg; 1.6 where landfills have no gas recovery). Gross: excludes collection transport and farm emissions.",
                  value: `${CO2E_PER_KG_DIVERTED} kg/kg`,
                  basis: "Assumption",
                },
                { label: "Frass yield", note: "Share of feedstock mass returned as frass. To be confirmed by the farm.", value: pct(FRASS_YIELD), basis: "Assumption" },
                { label: "General waste destination", note: "Council collection; landfill assumed.", value: "Landfill", basis: "Assumption" },
                {
                  label: "Profit lost when an item runs out",
                  note: "Used only for the forecast in section 5.",
                  value: `${LOST_SALE_MULT}× cost`,
                  basis: "Assumption",
                },
                { label: "Weight of items counted in pieces, loaves or litres", note: "Fixed kg per unit for each item.", value: "Per item", basis: "Assumption" },
              ]}
            />
          </Sub>
          <Sub title="Notes and limitations">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>
                <b>This report uses simulated demo data</b> (about 90 days for a sample kopitiam). It is not a record of a
                real business.
              </li>
              <li>Diverted means collected by a BSF farm. Waste awaiting pickup is not counted as diverted.</li>
              <li>Waste is weighed or estimated by staff when logged; it is not independently checked.</li>
              <li>GRI asks for metric tonnes. Figures are in kg because the amounts are small (1 t = 1,000 kg).</li>
              <li>The report has not been externally assured.</li>
            </ul>
          </Sub>
        </Section>

        <section className="border-t border-line pt-6 print:break-before-page">
          <h2 className="text-lg font-bold tracking-tight">GRI content index</h2>
          <p className="mt-1 text-sm">
            Statement of use: {BUSINESS_NAME} has reported the information cited in this GRI content index for the period{" "}
            {period} with reference to the GRI Standards. GRI 1 used: GRI 1: Foundation 2021.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className={th}>Disclosure</th>
                <th className={`${th} pl-4`}>Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[
                ["2-1 Organizational details", "Cover (partly: legal name and form to be added)"],
                ["2-2 Entities included in sustainability reporting", "Cover"],
                ["2-3 Reporting period, frequency and contact point", "Cover (contact point to be added)"],
                ["2-5 External assurance", "Cover, section 6 (none)"],
                ["306-1 Waste generation and significant waste-related impacts", "Section 2"],
                ["306-2 Management of significant waste-related impacts", "Sections 2, 3"],
                ["306-3 Waste generated", "Section 2"],
                ["306-4 Waste diverted from disposal", "Section 2"],
                ["306-5 Waste directed to disposal", "Section 2"],
                ["305-5 Reduction of GHG emissions", "Section 2 (estimate)"],
              ].map(([d, loc]) => (
                <tr key={d}>
                  <td className="py-1.5">GRI {d}</td>
                  <td className="py-1.5 pl-4 text-muted">{loc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="keep border-t border-line pt-6 text-sm">
          <h2 className="text-lg font-bold tracking-tight">Review and sign-off</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div className="border-t border-ink/40 pt-1 text-xs text-muted">Reviewed by (owner or manager)</div>
            <div className="border-t border-ink/40 pt-1 text-xs text-muted">Date</div>
          </div>
        </section>

        <details className="no-print group border-t border-line pt-6 text-sm">
          <summary className="cursor-pointer list-none text-lg font-bold tracking-tight">
            <span className="mr-2 inline-block text-brand transition-transform group-open:rotate-90">›</span>
            How each figure is calculated
          </summary>
          <p className="mt-2 text-muted">
            Every figure in this report, the formula behind it, and where its inputs and factors come from.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className={th}>Figure</th>
                  <th className={`${th} pl-4`}>Calculation</th>
                  <th className={`${th} pl-4`}>Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {(
                  [
                    ["Food waste generated", "Sum of every waste log: quantity × kg per unit", "Waste logs (staff phone log); kg per unit set per item. Definition: GRI 306-3"],
                    ["Cost of food wasted", "Sum of each waste log's cost: quantity × the item's unit cost, unless staff entered the cost", "Waste logs; unit cost from item settings"],
                    ["Diverted from disposal", "Sum of kg in BSF pickups marked Collected", "BSF pickup records with batch code. Definition: GRI 306-4"],
                    ["Directed to disposal", "Sum of kg of waste not eligible for BSF (cooked leftovers)", "Waste logs. Landfill assumed (section 6). Definition: GRI 306-5"],
                    ["Awaiting BSF pickup", "BSF-eligible kg not yet in a collected pickup", "Waste logs and pickup records"],
                    ["Diversion rate", "Diverted kg ÷ food waste generated kg", "Figures above. GRI 306-4"],
                    ["Waste per 100 kg bought", "Waste kg ÷ kg of ingredients bought × 100, per month and per 30-day window", "Waste logs and ERP purchase records"],
                    [
                      "CO₂e avoided",
                      `Diverted kg × ${CO2E_PER_KG_DIVERTED} kg CO₂e per kg`,
                      <>
                        US EPA WARM v16 (Dec 2023), Exhibit 1-10: landfilled food waste, 0.50 t CO₂e per short ton (0.55 kg
                        per kg, US average landfill). Landfills without gas recovery: 1.45 t per short ton (1.6 kg per kg),
                        Exhibit 1-49. {CO2E_PER_KG_DIVERTED} is used as the conservative low end.{" "}
                        <a
                          className="text-brand underline"
                          href="https://www.epa.gov/system/files/documents/2023-12/warm_organic_materials_v16_dec.pdf"
                          target="_blank"
                          rel="noreferrer"
                        >
                          EPA document
                        </a>
                        . Reported under GRI 305-5
                      </>,
                    ],
                    ["Frass fertiliser returned", `kg in pickups taken as frass × ${pct(FRASS_YIELD)}`, "Assumed yield, to be confirmed by the partner farm"],
                    ["Credit due from farm", `kg in pickups taken as credit × ${rm(BSF_CREDIT_PER_KG, 2)} per kg`, "Partner farm contract rate (demo value)"],
                    ["Pickups fully traceable", "Collected pickups with a batch code and linked waste logs ÷ all collected pickups", "Pickup records and waste logs"],
                    ["Waste logs with photo evidence", "Waste logs with a photo ÷ all waste logs", "Waste logs"],
                    ["Baseline vs now (targets)", "First 30 days of records compared with the last 30 days", "Waste logs, purchases and pickups"],
                    [
                      "Projected weekly waste and saving",
                      `Stock simulation of the next 4 weeks (200 runs per item), usual order vs smart order. A missed sale counts as ${LOST_SALE_MULT}× the ingredient cost`,
                      "POS sales history and ERP stock. Lost-sale multiple is an internal assumption",
                    ],
                  ] as [string, string, React.ReactNode][]
                ).map(([figure, calc, source]) => (
                  <tr key={figure}>
                    <td className="py-2 font-medium">{figure}</td>
                    <td className="py-2 pl-4">{calc}</td>
                    <td className="py-2 pl-4 text-muted">{source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </article>
    </div>
  );
}

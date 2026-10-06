import { CalendarClock, CheckCircle2, Sprout, Truck } from "lucide-react";
import { getOpenBsf, getPickups } from "@/lib/queries";
import { confirmCollection, schedulePickup } from "@/app/actions";
import {
  BSF_CREDIT_PER_KG,
  BSF_PARTNER_FARM,
  BSF_PICKUP_THRESHOLD_KG,
  BUSINESS_NAME,
  FRASS_YIELD,
  REASON_LABELS,
  type Reason,
} from "@/lib/config";
import { kg, rm } from "@/lib/format";
import { Card, CardHeader, PageTitle, Progress } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (d: Date) =>
  d.toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function BsfPage() {
  const [open, pickups] = await Promise.all([getOpenBsf(), getPickups()]);
  const ready = open.kg >= BSF_PICKUP_THRESHOLD_KG;
  const scheduled = pickups.filter((p) => p.status === "SCHEDULED");
  const history = pickups.filter((p) => p.status === "COLLECTED");

  const batch = (p: (typeof history)[number]) => (
    <li key={p.id} className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{p.batchCode}</span>
        <span className="flex items-center gap-1 text-xs font-medium text-brand">
          <CheckCircle2 size={14} /> Collected {p.collectedAt && fmtDate(p.collectedAt)}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">From</dt>
        <dd>{BUSINESS_NAME}</dd>
        <dt className="text-muted">To</dt>
        <dd>{p.partnerFarm}</dd>
        <dt className="text-muted">Contents</dt>
        <dd>
          <span className="num font-medium">{kg(p.totalKg)}</span>:{" "}
          {p.contents.map((c) => `${c.name} ${kg(c.kg)}`).join(", ")}
        </dd>
        <dt className="text-muted">Type</dt>
        <dd>{p.reasons.map((r) => REASON_LABELS[r as Reason]).join(", ")} (raw, uncooked)</dd>
        <dt className="text-muted">Logged</dt>
        <dd>
          {p.firstLogged && fmtDate(p.firstLogged)} to {p.lastLogged && fmtDate(p.lastLogged)} · {p.logCount}{" "}
          entries
        </dd>
        <dt className="text-muted">Return</dt>
        <dd>
          {p.returnType === "FRASS"
            ? `~${kg(p.totalKg * FRASS_YIELD)} frass fertiliser`
            : `${rm(p.totalKg * BSF_CREDIT_PER_KG, 2)} credit`}
        </dd>
      </dl>
    </li>
  );

  return (
    <div>
      <PageTitle
        title="BSF pickup"
        subtitle="Expired raw items, spoiled produce and trimmings go to black soldier fly farms instead of landfill."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Collected since last pickup"
            subtitle={open.since ? `${open.count} logs since ${fmtDate(open.since)}` : "Nothing waiting yet"}
          />
          <div className="num mb-2 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold">{kg(open.kg)}</span>
            <span className="text-muted">/ {BSF_PICKUP_THRESHOLD_KG} kg for a full load</span>
          </div>
          <Progress value={open.kg} max={BSF_PICKUP_THRESHOLD_KG} />
          {open.byItem.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {open.byItem.map((i) => (
                <li key={i.name} className="num rounded-full bg-canvas px-2.5 py-1 text-xs">
                  {i.name} · {kg(i.kg)}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Schedule a pickup" subtitle={BSF_PARTNER_FARM} />
          {open.count === 0 ? (
            <p className="text-sm text-muted">Log expired, spoiled or trimmings waste and it will show up here.</p>
          ) : (
            <form action={schedulePickup} className="space-y-3">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">What would you like back?</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className="cursor-pointer rounded-xl border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                    <input type="radio" name="returnType" value="FRASS" defaultChecked className="sr-only" />
                    <Sprout size={18} className="text-brand" />
                    <div className="mt-1 text-sm font-semibold">Frass fertiliser</div>
                    <div className="num text-xs text-muted">~{kg(open.kg * FRASS_YIELD)} for your herbs</div>
                  </label>
                  <label className="cursor-pointer rounded-xl border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                    <input type="radio" name="returnType" value="CREDIT" className="sr-only" />
                    <span className="num text-lg font-bold leading-none text-brand">RM</span>
                    <div className="mt-1 text-sm font-semibold">Credit</div>
                    <div className="num text-xs text-muted">~{rm(open.kg * BSF_CREDIT_PER_KG, 2)} off next bill</div>
                  </label>
                </div>
              </fieldset>
              <SubmitButton
                pendingLabel="Booking…"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-60"
              >
                <Truck size={18} /> Schedule pickup for tomorrow
              </SubmitButton>
              {!ready && (
                <p className="text-xs text-muted">
                  Below a full {BSF_PICKUP_THRESHOLD_KG} kg load. You can still book, or wait and we&apos;ll remind you
                  when it&apos;s full.
                </p>
              )}
            </form>
          )}
        </Card>
      </div>

      {scheduled.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Upcoming pickups" />
          <ul className="divide-y divide-line">
            {scheduled.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <div className="font-mono text-sm font-semibold">{p.batchCode}</div>
                  <div className="flex items-center gap-1 text-sm text-muted">
                    <CalendarClock size={14} /> {fmtDateTime(p.scheduledFor)} · {kg(p.totalKg)}
                  </div>
                </div>
                <form action={confirmCollection}>
                  <input type="hidden" name="pickupId" value={p.id} />
                  <SubmitButton
                    pendingLabel="Saving…"
                    className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand"
                  >
                    Confirm collected
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader
          title="Batch traceability"
          subtitle="Source, contents and collection time for every batch, as records for the Feed Act."
        />
        <ul className="space-y-3">{history.slice(0, 3).map(batch)}</ul>
        {history.length > 3 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-brand">
              Show {history.length - 3} older batches
            </summary>
            <ul className="mt-3 space-y-3">{history.slice(3).map(batch)}</ul>
          </details>
        )}
      </Card>
    </div>
  );
}

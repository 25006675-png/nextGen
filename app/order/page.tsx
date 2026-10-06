import { getItemInsights, type ItemInsight } from "@/lib/queries";
import { LOST_SALE_MULT, SUPPLIER_NAME } from "@/lib/config";
import { addDays, todayKey } from "@/lib/dates";
import { deliveryDay, pct, qty, rm } from "@/lib/format";
import { Card, CardHeader, PageTitle } from "@/components/ui";
import { SmartVsUsualChart } from "@/components/SmartVsUsualChart";
import { WhyOrder } from "@/components/WhyOrder";
import { ItemImage } from "@/components/ItemImage";
import { WhatsAppOrder } from "@/components/WhatsAppOrder";

export const dynamic = "force-dynamic";

function cadence(days: number) {
  return days === 7 ? "weekly" : `every ${days} days`;
}

// serviceLevel is the share of likely delivery cycles with no run-out.
function runOutText(serviceLevel: number) {
  return `Enough stock in ${Math.round(serviceLevel * 10)} of 10 likely delivery cycles`;
}

function reasonText(r: ItemInsight, later: boolean) {
  const left = qty(r.usableStock, r.unit) === qty(0, r.unit) ? "nothing" : `~${qty(r.usableStock, r.unit)}`;
  const usable = `${left} on the shelf will still be usable${later ? " by then" : ""}`;
  if (r.recommended > 0) return `Need ~${qty(r.coverForecast, r.unit)} over ${r.orderEveryDays} days; ${usable}.`;
  if (!later && qty(r.usableStock, r.unit) === qty(r.stockOnHand, r.unit))
    return `The ${qty(r.stockOnHand, r.unit)} on the shelf covers the next ${r.orderEveryDays} days.`;
  return `${usable}: enough for ${r.orderEveryDays} days.`;
}

function dayHeading(day: string, today: string) {
  if (day === today) return "Today's delivery";
  if (day === addDays(today, 1)) return "Tomorrow's delivery";
  return `${deliveryDay(day, today)} delivery`;
}

function orderMessage(day: string, today: string, items: ItemInsight[]) {
  const when = day === today ? "today's" : day === addDays(today, 1) ? "tomorrow's" : `the ${deliveryDay(day, today)}`;
  const order = items.filter((r) => r.recommended > 0);
  const skip = items.filter((r) => r.recommended === 0).map((r) => r.name.toLowerCase());
  const lines = [`Hi boss, order for ${when} delivery:`];
  for (const r of order) lines.push(`• ${r.name} ${qty(r.recommended, r.unit)}`);
  if (skip.length) lines.push(`No ${skip.join(", ")} ${order.length ? "this time" : "needed this time"}.`);
  lines.push("Thanks!");
  return lines.join("\n");
}

function standingMessage(items: ItemInsight[]) {
  const lines = [`Hi boss, from now on please change my regular order:`];
  for (const r of items)
    lines.push(`• ${r.name}: ${qty(r.regularOrder, r.unit)} ${cadence(r.orderEveryDays)} (was ${qty(r.usualOrder, r.unit)})`);
  lines.push("Everything else stays the same. Thanks!");
  return lines.join("\n");
}

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ why?: string }> }) {
  const { why } = await searchParams; // ?why=<id> opens that item's "Why this order?" panel
  const today = todayKey();
  const insights = await getItemInsights(today);
  const rows = [...insights].sort((a, b) => b.savingRM - a.savingRM);
  // Weekly figures are averages over the next 4 simulated weeks. Net = waste saved minus extra missed sales;
  // missed sales are shown as the remainder so the rounded breakdown adds up.
  const net = Math.round(rows.reduce((a, r) => a + r.savingRM, 0));
  const wasteSaved = Math.round(rows.reduce((a, r) => a + r.wasteUsualRM - r.wasteSmartRM, 0));
  const extraMissed = wasteSaved - net;

  // Items added from Log waste have no sales or stock yet, so there is nothing to size an order from.
  const isNew = (r: ItemInsight) => r.weekForecast === 0 && r.stockOnHand === 0;
  const newItems = rows.filter(isNew);
  const active = rows.filter((r) => !isNew(r));

  // Group by the day each item's next delivery arrives.
  const byDay = new Map<string, ItemInsight[]>();
  for (const r of [...active].sort((a, b) => a.name.localeCompare(b.name)))
    byDay.set(r.nextDelivery, [...(byDay.get(r.nextDelivery) ?? []), r]);
  const deliveries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, items }));
  const changed = active.filter((r) => r.regularOrder !== r.usualOrder);
  const unchanged = active.length - changed.length;

  const chartRows = rows
    .filter((r) => Math.abs(r.savingRM) >= 1)
    .map((r) => ({
      name: r.name,
      usual: Math.round(r.wasteUsualRM + r.missedUsualRM),
      smart: Math.round(r.wasteSmartRM + r.missedSmartRM),
    }));

  return (
    <div>
      <PageTitle title="Smart order" subtitle="What to buy next time, and what to order regularly instead of your usual amounts." />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <div className="rounded-xl bg-brand-soft p-4">
                <div className="text-sm font-medium text-brand-strong">Follow this list and save about</div>
                <div className="num text-4xl font-extrabold tracking-tight text-brand-strong">{rm(net)} / week</div>
                <div className="mt-0.5 text-xs text-ink/70">Average week over the next 4 weeks, net of extra sell-outs</div>
                <dl className="num mt-3 space-y-1 border-t border-brand/15 pt-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink/80">Waste saved</dt>
                    <dd className="font-medium">{rm(wasteSaved)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink/80">{extraMissed >= 0 ? "Extra missed sales" : "Fewer missed sales"}</dt>
                    <dd className="font-medium">
                      {extraMissed >= 0 ? "−" : "+"}
                      {rm(Math.abs(extraMissed))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 font-semibold text-brand-strong">
                    <dt>Net saving per week</dt>
                    <dd>{rm(net)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 text-xs text-ink/70">
                    <dt>Per month (× 4.3)</dt>
                    <dd>≈ {rm(net * 4.3)}</dd>
                  </div>
                </dl>
              </div>
              <ol className="mt-4 space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold">1</span>
                  <span>
                    <b>Forecast</b> each item&apos;s use from the same weekday over the last 4 weeks, adjusted for
                    holidays and Ramadan.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold">2</span>
                  <span>
                    <b>Size the buffer</b> from that item&apos;s own forecast errors: more for items whose sales swing,
                    less for perishables that would spoil.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold">3</span>
                  <span>
                    <b>Test both plans</b> on 200 simulated 4-week futures of sales, deliveries and expiry dates:
                    your usual orders vs the smart order.
                  </span>
                </li>
              </ol>
            </div>
            <div>
              <h2 className="font-semibold">Where the saving comes from</h2>
              <p className="mb-2 text-sm text-muted">Money lost in an average week (waste + missed sales), by item</p>
              <SmartVsUsualChart rows={chartRows} />
              <p className="mt-2 text-xs text-muted">
                A missed sale counts as {LOST_SALE_MULT}× the ingredient cost (assumed). Items that change by less
                than RM1 a week are not shown.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-3 mt-8">
        <h2 className="text-lg font-bold tracking-tight">Next deliveries</h2>
        <p className="text-sm text-muted">
          What to order for each delivery, sized to what will still be on the shelf that day.
        </p>
        {newItems.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            New: {newItems.map((r) => r.name).join(", ")}. Order advice starts once there are a few weeks of sales
            and deliveries for {newItems.length === 1 ? "it" : "them"}.
          </p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {deliveries.map(({ day, items }) => {
          const skips = items.filter((r) => r.recommended === 0).length;
          return (
            <Card key={day} className="flex flex-col">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{dayHeading(day, today)}</h3>
                  <p className="text-xs text-muted">
                    {items.length} {items.length === 1 ? "item" : "items"}
                    {skips > 0 && ` · ${skips} to skip`}
                  </p>
                </div>
                <WhatsAppOrder
                  label="Send order"
                  supplier={SUPPLIER_NAME}
                  message={orderMessage(day, today, items)}
                  reply="Ok boss, noted 👍"
                />
              </div>
              <ul className="divide-y divide-line">
                {items.map((r) => {
                  const skip = r.recommended === 0;
                  const later = r.nextDelivery !== today;
                  return (
                    <li key={r.id} className="flex gap-3 py-3">
                      <ItemImage name={r.name} className="h-12 w-12" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className="font-semibold">{r.name}</h4>
                          <span className={`num whitespace-nowrap text-xl font-bold ${skip ? "text-muted" : ""}`}>
                            {skip ? "Skip" : qty(r.recommended, r.unit)}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-ink/80">{reasonText(r, later)}</p>
                          <span className="num shrink-0 whitespace-nowrap text-xs text-muted">
                            usually {qty(r.usualOrder, r.unit)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-muted">
                            {runOutText(r.serviceLevel)}
                            {r.bufferPct >= 0.01 && ` · +${pct(r.bufferPct)} buffer`}
                            {r.bufferPct <= -0.01 && " · sized below forecast"}
                          </p>
                          <WhyOrder itemId={r.id} name={r.name} autoOpen={String(r.id) === why} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Change your standing order</h2>
            <p className="text-sm text-muted">
              From now on, per delivery.
              {unchanged > 0 && ` ${unchanged} other ${unchanged === 1 ? "item stays" : "items stay"} the same.`}
            </p>
          </div>
          {changed.length > 0 && (
            <WhatsAppOrder
              label="Send new standing order"
              supplier={SUPPLIER_NAME}
              message={standingMessage(changed)}
              reply="Ok boss, updated 👍 Start from next delivery."
            />
          )}
        </div>
        <ul className="divide-y divide-line">
          {changed.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <ItemImage name={r.name} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{r.name}</h3>
                <p className="num text-sm">
                  <span className="text-muted line-through">{qty(r.usualOrder, r.unit)}</span>{" "}
                  <span className="text-muted">→</span> <b className="text-base">{qty(r.regularOrder, r.unit)}</b>{" "}
                  <span className="text-xs text-muted">{cadence(r.orderEveryDays)}</span>
                </p>
              </div>
              {r.savingRM >= 1 && (
                <span className="num shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand">
                  save {rm(r.savingRM)}/wk
                </span>
              )}
              {r.savingRM <= -1 && (
                <span className="num shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-sm font-semibold text-warn">
                  costs {rm(-r.savingRM)}/wk more
                </span>
              )}
            </li>
          ))}
        </ul>
        {changed.length === 0 && <p className="text-sm text-muted">Your usual amounts are already right.</p>}
      </Card>

      <p className="mt-4 text-xs text-muted">
        Forecast = average use on the same weekday over the last 4 weeks, adjusted for holidays, Ramadan and school
        holidays. Each item&apos;s buffer comes from its own forecast errors: bigger for items whose sales swing more,
        smaller for perishables where extra stock is likely to spoil. Savings come from simulating the next 4 weeks of
        deliveries and expiry dates 200 times.
      </p>
      <p className="mt-1 text-xs text-muted">
        Item photos:{" "}
        <a href="/items/CREDITS.txt" className="underline">
          credits and licences
        </a>
        .
      </p>
    </div>
  );
}

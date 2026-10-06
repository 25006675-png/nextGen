import { Camera } from "lucide-react";
import { getLogFormData } from "@/lib/queries";
import { REASON_LABELS } from "@/lib/config";
import { qty, rm } from "@/lib/format";
import { Card, CardHeader, PageTitle } from "@/components/ui";
import { LogWasteForm } from "@/components/LogWasteForm";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const { items, recent } = await getLogFormData();
  return (
    <div className="md:grid md:grid-cols-[1fr_320px] md:gap-6">
      <div>
        <PageTitle title="Log waste" subtitle="Item, amount, reason. Done in under 10 seconds." />
        <LogWasteForm items={items} />
      </div>
      <Card className="mt-6 md:mt-14 md:self-start">
        <CardHeader title="Recently logged" />
        <ul className="divide-y divide-line">
          {recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
              {r.photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photoPath} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-canvas text-muted">
                  <Camera size={16} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {qty(r.qty, r.unit)} {r.name}
                </div>
                <div className="text-xs text-muted">
                  {REASON_LABELS[r.reason]}
                  {r.bsfEligible && " · BSF"} ·{" "}
                  {r.loggedAt.toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <span className="num font-semibold">{rm(r.costRM, 2)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

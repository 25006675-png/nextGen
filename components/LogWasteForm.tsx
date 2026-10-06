"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Camera, CheckCircle2, CircleAlert, Plus, Search } from "lucide-react";
import { logWaste, type LogState } from "@/app/actions";
import { REASONS, REASON_LABELS, isBsfEligible, type Reason } from "@/lib/config";
import { WhatChanged } from "@/components/WhatChanged";
import { ItemImage } from "@/components/ItemImage";
import { AddItemForm } from "@/components/AddItemForm";

type Item = { id: number; name: string; unit: string; unitCost: number; category: string };

const REASON_HINTS: Record<Reason, string> = {
  EXPIRED: "Past its date",
  SPOILED: "Rotten, mouldy, off",
  OVERBOUGHT: "Cooked leftovers",
  TRIMMINGS: "Peels, bones, offcuts",
};

const QUICK: Record<string, number[]> = { kg: [0.5, 1, 5], L: [0.5, 1, 5] };

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-2xl bg-brand py-4 text-lg font-semibold text-white shadow-lg transition active:scale-[0.99] disabled:bg-[#cfcac0] disabled:shadow-none"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function LogWasteForm({ items }: { items: Item[] }) {
  const [state, action] = useActionState<LogState, FormData>(logWaste, null);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState<number | null>(null);
  const [qtyText, setQtyText] = useState("");
  const [reason, setReason] = useState<Reason | null>(null);
  const [costText, setCostText] = useState<string | null>(null); // null = auto
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [closedAt, setClosedAt] = useState<number | null>(null); // result card the user closed
  const [adding, setAdding] = useState(false); // "Other item" panel open
  const [added, setAdded] = useState<Item[]>([]); // quick-added this visit, until the page data refreshes
  const formRef = useRef<HTMLFormElement>(null);

  const all = useMemo(() => [...items, ...added.filter((a) => !items.some((i) => i.id === a.id))], [items, added]);
  const item = all.find((i) => i.id === itemId) ?? null;
  const quantity = Number(qtyText);
  const autoCost = item && quantity > 0 ? quantity * item.unitCost : 0;
  const cost = costText ?? (autoCost ? autoCost.toFixed(2) : "");
  const ready = !!item && quantity > 0 && !!reason;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return all.filter((i) => i.name.toLowerCase().includes(q));
    // 8 tiles + the "Other item" tile fill the 3 x 3 grid.
    const top = all.slice(0, 8);
    return item && !top.includes(item) ? [...top.slice(0, 7), item] : top;
  }, [all, search, item]);

  // Reset after a successful save so the next entry starts clean.
  useEffect(() => {
    if (state?.ok) {
      setItemId(null);
      setQtyText("");
      setReason(null);
      setCostText(null);
      setPhotoName(null);
      setSearch("");
      formRef.current?.reset();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state]);

  const bump = (n: number) => setQtyText(String(Math.round(((Number(qtyText) || 0) + n) * 100) / 100));
  const quick = item ? (QUICK[item.unit] ?? [1, 5, 10]) : [];

  return (
    <form ref={formRef} action={action} className="space-y-5">
      {state?.change && state.at !== closedAt && (
        <WhatChanged change={state.change} message={state.message} onClose={() => setClosedAt(state.at)} />
      )}
      {state && !state.change && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
            state.ok ? "bg-brand-soft text-brand-strong" : "bg-loss-soft text-loss"
          }`}
        >
          {state.ok ? <CheckCircle2 size={18} className="mt-px shrink-0" /> : <CircleAlert size={18} className="mt-px shrink-0" />}
          {state.message}
        </div>
      )}

      <input type="hidden" name="itemId" value={itemId ?? ""} />
      <input type="hidden" name="reason" value={reason ?? ""} />

      {/* 1. Item */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">1. What was thrown away?</legend>
        <label className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          <Search size={18} className="text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all items"
            className="w-full bg-transparent text-base outline-none"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {shown.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => {
                setItemId(i.id);
                setCostText(null);
              }}
              className={`flex min-h-14 flex-col items-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-medium leading-tight transition ${
                itemId === i.id ? "border-brand bg-brand text-white" : "border-line bg-surface active:bg-canvas"
              }`}
            >
              <ItemImage name={i.name} className="h-14 w-14" />
              {i.name}
            </button>
          ))}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-14 flex-col items-center gap-1.5 rounded-xl border border-dashed border-brand/50 bg-surface px-2 py-2 text-sm font-medium leading-tight text-brand-strong active:bg-canvas"
            >
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand-soft">
                <Plus size={26} className="text-brand" />
              </span>
              {search.trim() ? `Add “${search.trim()}”` : "Other item"}
            </button>
          )}
        </div>
        {shown.length === 0 && !adding && (
          <p className="mt-2 text-sm text-muted">No item matches “{search.trim()}”. Add it as a new item.</p>
        )}
        {adding && (
          <AddItemForm
            initialName={search.trim()}
            onCancel={() => setAdding(false)}
            onAdded={(newItem) => {
              setAdded((a) => [...a, newItem]);
              setItemId(newItem.id);
              setCostText(null);
              setSearch("");
              setAdding(false);
            }}
          />
        )}
      </fieldset>

      {/* 2. Quantity */}
      <fieldset disabled={!item}>
        <legend className="mb-2 text-sm font-semibold">2. How much?</legend>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 focus-within:border-brand">
          <input
            name="qty"
            inputMode="decimal"
            type="number"
            step="any"
            min="0"
            value={qtyText}
            onChange={(e) => {
              setQtyText(e.target.value);
              setCostText(null);
            }}
            placeholder="0"
            className="num w-full bg-transparent text-4xl font-bold outline-none placeholder:text-line"
            aria-label="Quantity"
          />
          <span className="text-lg font-medium text-muted">{item?.unit ?? ""}</span>
        </div>
        {item && (
          <div className="mt-2 flex gap-2">
            {quick.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  bump(n);
                  setCostText(null);
                }}
                className="num flex-1 rounded-xl border border-line bg-surface py-2 text-sm font-medium active:bg-canvas"
              >
                +{n} {item.unit}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      {/* 3. Reason */}
      <fieldset disabled={!item}>
        <legend className="mb-2 text-sm font-semibold">3. Why?</legend>
        <div className="grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-xl border p-3 text-left transition ${
                reason === r ? "border-brand bg-brand-soft ring-2 ring-brand" : "border-line bg-surface active:bg-canvas"
              }`}
            >
              <div className="font-semibold">{REASON_LABELS[r]}</div>
              <div className="text-xs text-muted">{REASON_HINTS[r]}</div>
              {isBsfEligible(r) && (
                <span className="mt-1.5 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                  BSF-eligible
                </span>
              )}
            </button>
          ))}
        </div>
      </fieldset>

      {/* 4. Cost (auto) */}
      <fieldset disabled={!item}>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <span>
            <span className="block text-sm font-semibold">Cost</span>
            <span className="block text-xs text-muted">
              {item ? `Auto: RM${item.unitCost.toFixed(2)} per ${item.unit}` : "Calculated from the item price"}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-muted">RM</span>
            <input
              name="cost"
              inputMode="decimal"
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCostText(e.target.value)}
              className="num w-24 rounded-lg bg-canvas px-2 py-1.5 text-right text-lg font-semibold outline-none focus:ring-2 focus:ring-brand"
              aria-label="Cost in RM"
            />
          </span>
        </label>
      </fieldset>

      {/* Optional photo */}
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        <Camera size={20} />
        <span className="flex-1">{photoName ?? "Add photo (optional)"}</span>
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp,image/heic"
          capture="environment"
          className="sr-only"
          onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      {/* Sticky only while filling in, so it never covers the "What changed" card after a save. */}
      <div className={item ? "sticky bottom-24 z-10 md:bottom-4" : ""}>
        <SubmitButton
          disabled={!ready}
          label={ready ? `Log waste · RM${Number(cost || 0).toFixed(2)}` : "Pick item, amount and reason"}
        />
      </div>
    </form>
  );
}

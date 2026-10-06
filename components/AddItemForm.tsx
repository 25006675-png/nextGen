"use client";

import { useState, useTransition } from "react";
import { CircleAlert } from "lucide-react";
import { addItem, type NewItem } from "@/app/actions";
import { ITEM_CATEGORIES, ITEM_UNITS, type ItemCategory } from "@/lib/config";

/**
 * Inline "add an item that isn't on the list" panel for the Log waste screen.
 * It sits inside the log form, so it uses plain buttons and stops Enter from
 * submitting the waste log.
 */
export function AddItemForm({
  initialName,
  onAdded,
  onCancel,
}: {
  initialName: string;
  onAdded: (item: NewItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<string>("kg");
  const [category, setCategory] = useState<ItemCategory>("produce");
  const [price, setPrice] = useState("");
  const [grams, setGrams] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await addItem({ name, unit, category, unitCost: Number(price), gramsPerPiece: Number(grams) });
      if (res.ok) onAdded(res.item);
      else setError(res.message);
    });
  const enterSaves = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };
  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-brand";

  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-brand/30 bg-brand-soft/40 p-3">
      <div className="text-sm font-semibold">Add an item that isn&apos;t on the list</div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">Name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={enterSaves}
          placeholder="e.g. Lobak, Cili padi, Santan"
          className={field}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Counted in</span>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-canvas p-1">
            {ITEM_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={`rounded-md py-1.5 text-sm font-medium ${unit === u ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Price per {unit}</span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted">RM</span>
            <input
              inputMode="decimal"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={enterSaves}
              placeholder="0.00"
              className={`num ${field}`}
            />
          </span>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">Type</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)} className={field}>
          {Object.entries(ITEM_CATEGORIES).map(([key, c]) => (
            <option key={key} value={key}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">
          Sets a starting shelf life ({ITEM_CATEGORIES[category].shelfLifeDays} days) for expiry alerts.
        </span>
      </label>

      {unit === "pcs" && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">One piece weighs about (g), for kg and ESG totals</span>
          <input
            inputMode="numeric"
            type="number"
            min="1"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            onKeyDown={enterSaves}
            className={`num ${field}`}
          />
        </label>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-loss">
          <CircleAlert size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add and select"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}

"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  BSF_PARTNER_FARM,
  ITEM_CATEGORIES,
  ITEM_UNITS,
  REASONS,
  REASON_LABELS,
  isBsfEligible,
  type ItemCategory,
  type Reason,
} from "@/lib/config";
import { addDays, parseDay, todayKey } from "@/lib/dates";
import { qty as fmtQty, rm } from "@/lib/format";
import { getChangeSnapshot, type ChangeSnapshot } from "@/lib/queries";

/** Numbers before and after a waste log, for the "What changed" card. */
export type LogChange = { itemId: number; before: ChangeSnapshot; after: ChangeSnapshot };

export type LogState = { ok: boolean; message: string; at: number; change?: LogChange } | null;

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export type NewItem = { id: number; name: string; unit: string; unitCost: number; category: string };
export type AddItemResult = { ok: true; item: NewItem } | { ok: false; message: string };

/** Quick-add an item that isn't on the list yet, straight from the Log waste screen. */
export async function addItem(input: {
  name: string;
  unit: string;
  category: string;
  unitCost: number;
  gramsPerPiece?: number;
}): Promise<AddItemResult> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const fail = (message: string) => ({ ok: false as const, message });
  if (name.length < 2 || name.length > 40) return fail("Enter a name (2 to 40 letters).");
  if (!(ITEM_UNITS as readonly string[]).includes(input.unit)) return fail("Pick a unit.");
  if (!(input.category in ITEM_CATEGORIES)) return fail("Pick a category.");
  if (!(input.unitCost > 0 && input.unitCost < 10_000)) return fail(`Enter the price per ${input.unit}.`);
  const grams = input.unit === "pcs" ? Number(input.gramsPerPiece) : 0;
  if (input.unit === "pcs" && !(grams > 0 && grams < 50_000)) return fail("Enter roughly what one piece weighs.");

  const existing = (await prisma.item.findMany({ select: { name: true } })).find(
    (i) => i.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return fail(`${existing.name} is already on the list. Search for it instead.`);

  const defaults = ITEM_CATEGORIES[input.category as ItemCategory];
  const item = await prisma.item.create({
    data: {
      name,
      unit: input.unit,
      category: input.category,
      unitCost: Math.round(input.unitCost * 100) / 100,
      shelfLifeDays: defaults.shelfLifeDays,
      orderEveryDays: defaults.orderEveryDays,
      usualOrder: 0, // unknown until the owner sets it or deliveries are recorded
      packSize: input.unit === "pcs" ? 1 : 0.5,
      kgPerUnit: input.unit === "pcs" ? grams / 1000 : 1, // 1 L of food ~ 1 kg
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, item: { id: item.id, name: item.name, unit: item.unit, unitCost: item.unitCost, category: item.category } };
}

export async function logWaste(_prev: LogState, form: FormData): Promise<LogState> {
  const fail = (message: string) => ({ ok: false, message, at: Date.now() });

  const itemId = Number(form.get("itemId"));
  const quantity = Number(form.get("qty"));
  const reason = String(form.get("reason")) as Reason;
  const costInput = String(form.get("cost") ?? "").trim();

  const item = Number.isInteger(itemId) ? await prisma.item.findUnique({ where: { id: itemId } }) : null;
  if (!item) return fail("Pick an item.");
  if (!(quantity > 0 && quantity < 10_000)) return fail("Enter how much was thrown away.");
  if (!REASONS.includes(reason)) return fail("Pick a reason.");
  const costRM = costInput === "" ? quantity * item.unitCost : Number(costInput);
  if (!(costRM >= 0 && costRM < 100_000)) return fail("Cost must be a positive number.");

  let photoPath: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const ext = PHOTO_TYPES[photo.type];
    if (!ext) return fail("Photo must be a JPG, PNG, WEBP or HEIC image.");
    if (photo.size > MAX_PHOTO_BYTES) return fail("Photo is larger than 5 MB.");
    const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await photo.arrayBuffer()));
    photoPath = `/api/photos/${name}`;
  }

  const before = await getChangeSnapshot(itemId); // after validation, before the write
  const bsfEligible = isBsfEligible(reason);
  await prisma.$transaction(async (tx) => {
    await tx.wasteLog.create({
      data: { itemId, qty: quantity, costRM: Math.round(costRM * 100) / 100, reason, photoPath, bsfEligible },
    });
    // Thrown-away stock leaves inventory, earliest expiry first. Trimmings are
    // offcuts of food that was already used, so stock is unchanged.
    if (reason === "TRIMMINGS") return;
    let left = quantity;
    const lots = await tx.purchase.findMany({
      where: { itemId, remaining: { gt: 0 } },
      orderBy: { expiresAt: "asc" },
    });
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      await tx.purchase.update({ where: { id: lot.id }, data: { remaining: lot.remaining - take } });
      left -= take;
    }
  });

  // The models are re-run on the new data, so this shows the effect of the log.
  const after = await getChangeSnapshot(itemId);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Logged ${fmtQty(quantity, item.unit)} ${item.name} (${REASON_LABELS[reason].toLowerCase()}), ${rm(costRM, 2)}${
      bsfEligible ? ". Tagged for BSF pickup." : "."
    }`,
    at: Date.now(),
    change: before && after ? { itemId, before, after } : undefined,
  };
}

export async function schedulePickup(form: FormData) {
  const returnType = form.get("returnType") === "CREDIT" ? "CREDIT" : "FRASS";
  const logs = await prisma.wasteLog.findMany({
    where: { bsfEligible: true, pickupId: null },
    include: { item: { select: { kgPerUnit: true } } },
  });
  if (logs.length === 0) return;

  const today = todayKey();
  const seq = (await prisma.pickup.count()) + 1;
  const scheduledFor = parseDay(addDays(today, 1));
  scheduledFor.setHours(9, 0, 0, 0);

  await prisma.$transaction(async (tx) => {
    const pickup = await tx.pickup.create({
      data: {
        batchCode: `BSF-${today.replaceAll("-", "").slice(2)}-${String(seq).padStart(3, "0")}`,
        partnerFarm: BSF_PARTNER_FARM,
        scheduledFor,
        status: "SCHEDULED",
        totalKg: Math.round(logs.reduce((a, l) => a + l.qty * l.item.kgPerUnit, 0) * 100) / 100,
        returnType,
      },
    });
    await tx.wasteLog.updateMany({ where: { id: { in: logs.map((l) => l.id) } }, data: { pickupId: pickup.id } });
  });
  revalidatePath("/", "layout");
}

export async function confirmCollection(form: FormData) {
  const id = Number(form.get("pickupId"));
  if (!Number.isInteger(id)) return;
  await prisma.pickup.updateMany({
    where: { id, status: "SCHEDULED" },
    data: { status: "COLLECTED", collectedAt: new Date() },
  });
  revalidatePath("/", "layout");
}

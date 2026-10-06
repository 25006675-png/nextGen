import { getWhy } from "@/lib/queries";

// Data for one item's "Why this order?" panel, loaded when the panel opens.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Bad item id" }, { status: 400 });
  const why = await getWhy(id);
  if (!why) return Response.json({ error: "Item not found" }, { status: 404 });
  return Response.json(why);
}

import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

// Serves waste photos saved by the logWaste action (files added after build
// aren't served from /public in production).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const match = /^[\w-]+\.(jpg|png|webp|heic)$/.exec(name);
  if (!match) return new Response("Not found", { status: 404 });
  try {
    const file = await readFile(path.join(process.cwd(), "uploads", name));
    return new Response(file, { headers: { "Content-Type": TYPES[match[1]], "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

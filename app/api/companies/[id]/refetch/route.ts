import { NextRequest } from "next/server";
import { fail, json, ownerOf, readBody } from "@/lib/http";
import { buildPack, checkRate, getPack, savePack } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await readBody(req);
    const owner = ownerOf(req);
    const row = await getPack((await params).id, owner);
    await checkRate(owner!, "add"); // an explicit refresh hits SEC, so it counts against the add limit
    const built = await buildPack(row.ticker, true);
    await savePack(owner!, built, row.id);
    return json({ id: row.id, pack: built.pack, meta: built.meta });
  } catch (e) {
    return fail(e);
  }
}

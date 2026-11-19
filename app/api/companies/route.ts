import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { ensureOwner, fail, json, ownerOf, readBody } from "@/lib/http";
import { buildPack, checkRate, countPacks, findByTicker, LIMITS, listPacks, savePack, validTicker } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const owner = ownerOf(req);
    return json({ packs: owner ? await listPacks(owner) : [] });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const { owner, fresh } = ensureOwner(req);
  const set = fresh ? owner : undefined;
  try {
    const body = await readBody(req);
    const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
    if (!validTicker(ticker)) throw new AppError(400, "bad_ticker", "Ticker must be 1-6 letters (A-Z).");
    if (await findByTicker(owner, ticker)) throw new AppError(409, "exists", `${ticker} is already in your library. Open it and use Re-fetch to refresh.`);
    if ((await countPacks(owner)) >= LIMITS.packCap) throw new AppError(409, "pack_cap", `Library is full (${LIMITS.packCap} packs). Delete one first.`);
    await checkRate(owner, "add");
    const built = await buildPack(ticker, false);
    const row = await savePack(owner, built);
    return json({ id: row.id, pack: built.pack, meta: built.meta }, 201, set);
  } catch (e) {
    return fail(e, set);
  }
}

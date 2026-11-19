import { NextRequest } from "next/server";
import { fail, json, ownerOf } from "@/lib/http";
import { checkRate, deletePack, getPack } from "@/lib/service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const row = await getPack((await params).id, ownerOf(req));
    return json({ id: row.id, pack: JSON.parse(row.packJson), meta: JSON.parse(row.metaJson) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const owner = ownerOf(req);
    const row = await getPack((await params).id, owner);
    await checkRate(owner!, "write");
    await deletePack(row.id);
    return json({ deleted: row.id });
  } catch (e) {
    return fail(e);
  }
}

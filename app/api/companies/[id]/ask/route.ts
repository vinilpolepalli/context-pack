import { NextRequest } from "next/server";
import { fail, json, ownerOf } from "@/lib/http";
import { getPack, type Meta } from "@/lib/service";
import { buildQA } from "@/lib/qa";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const row = await getPack((await params).id, ownerOf(req));
    const meta: Meta = JSON.parse(row.metaJson);
    const reasons = Object.fromEntries(meta.omitted.map((o) => [o.key, o.reason]));
    return json({ answers: buildQA(JSON.parse(row.packJson), reasons) });
  } catch (e) {
    return fail(e);
  }
}

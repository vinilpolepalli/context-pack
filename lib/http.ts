import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import { LIMITS, isUid } from "./service";

export const COOKIE = "cp_uid";

export function ownerOf(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE)?.value;
  return isUid(v) ? v : null;
}

/** Existing owner, or a fresh one that the response must set as a cookie. */
export function ensureOwner(req: NextRequest): { owner: string; fresh: boolean } {
  const o = ownerOf(req);
  return o ? { owner: o, fresh: false } : { owner: randomUUID(), fresh: true };
}

export function json(data: unknown, status = 200, setOwner?: string): NextResponse {
  const res = NextResponse.json(data, { status });
  if (setOwner) res.cookies.set(COOKIE, setOwner, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export function fail(e: unknown, setOwner?: string): NextResponse {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message } }, e.status, setOwner);
  console.error(e);
  return json({ error: { code: "internal", message: "Unexpected server error." } }, 500, setOwner);
}

/** Same-origin + JSON content-type guard for writes; 413 above 20KB. */
export async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) throw new AppError(403, "bad_origin", "Cross-origin writes are not allowed.");
  if (Number(req.headers.get("content-length") || 0) > LIMITS.bodyBytes) throw new AppError(413, "too_large", "Request body exceeds 20KB.");
  const text = await req.text();
  if (Buffer.byteLength(text) > LIMITS.bodyBytes) throw new AppError(413, "too_large", "Request body exceeds 20KB.");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {}
  throw new AppError(400, "bad_json", "Body must be a JSON object.");
}

// Usage: node scripts/screenshots.mjs <base-url> <cp_uid cookie value> <pack id> [outdir]
import { chromium } from "playwright";
const [base, uid, id, out = "/tmp"] = process.argv.slice(2);
const b = await chromium.launch();
const host = new URL(base).hostname;
async function shot(vp, path, file, full) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.addCookies([{ name: "cp_uid", value: uid, domain: host, path: "/" }]);
  const p = await ctx.newPage();
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}/${file}`, fullPage: full });
  await ctx.close();
}
await shot({ width: 1280, height: 800 }, "/", "cp2-library.png", false);
await shot({ width: 1280, height: 900 }, `/pack/${id}`, "cp2-pack.png", true);
await shot({ width: 390, height: 844 }, "/", "cp2-mobile.png", false);
await b.close();

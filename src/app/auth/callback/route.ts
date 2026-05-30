import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Build a base URL we can trust regardless of what `req.url` happens to contain.
// Behind Caddy, Next.js sometimes resolves `req.url` to `localhost:3000` (the
// bound HOSTNAME leaks through), so we read the actual `Host` header that
// Caddy preserves, plus `X-Forwarded-Proto`. Fall back to SITE_URL env if
// neither header is usable.
function siteOrigin(req: Request): string {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host && !host.startsWith("localhost") && !host.startsWith("127.")) {
    return `${proto}://${host}`;
  }
  return process.env.SITE_URL || "https://samvidya.com";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = siteOrigin(req);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${base}/login?error=missing_code`);
  }
  const sb = createClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }
  // The middleware routes by role on the next request.
  return NextResponse.redirect(`${base}/firm`);
}

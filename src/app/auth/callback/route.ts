import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchange the OTP code Supabase sent in the magic link for a session cookie,
// then redirect by role. Default landing is /firm; superadmin → /super; CMO → /party.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }
  const sb = createClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  // The middleware will route us by role on the next request; just send to /firm
  // and it'll redirect from there.
  return NextResponse.redirect(new URL("/firm", url.origin));
}

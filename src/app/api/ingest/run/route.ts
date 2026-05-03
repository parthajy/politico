import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runIngestAll } from "@/lib/ingest";

// Manual-refresh endpoint for the firm /sources page and demos.
// Requires an authenticated firm_admin or firm_analyst user.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  if (role !== "firm_admin" && role !== "firm_analyst") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const started = Date.now();
  try {
    const summaries = await runIngestAll();
    return NextResponse.json({ ok: true, ms: Date.now() - started, summaries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, ms: Date.now() - started },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({
  event_id: z.string().uuid(),
  status: z.enum(["new", "monitoring", "escalated", "closed"]),
  notes: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("triage")
    .upsert(
      {
        event_id: body.event_id,
        status: body.status,
        notes: body.notes ?? null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    );

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  // If escalated to S1-tier severity, also drop an alert so party-side sees it.
  if (body.status === "escalated") {
    const { data: ev } = await supabase
      .from("classifications")
      .select("snt_score, sentiment_justification, events!inner(title)")
      .eq("event_id", body.event_id)
      .single();
    if (ev) {
      const evJoin = (ev.events as unknown) as { title: string };
      const sev = (ev.snt_score ?? 0) >= 0.85 ? "s1" : "s2";
      await supabase.from("alerts").insert({
        severity: sev,
        title: `Escalated: ${evJoin.title.slice(0, 120)}`,
        body: ev.sentiment_justification,
        event_id: body.event_id,
      });
    }
  }

  await auditLog({
    user_id: user.id,
    action: `triage_${body.status}`,
    entity_type: "events",
    entity_id: body.event_id,
    metadata: { notes: body.notes ?? null },
  });

  return NextResponse.json({ ok: true, status: body.status });
}

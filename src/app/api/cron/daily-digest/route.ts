import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDigestData, renderDigestHtml } from "@/lib/digest/daily";
import { Resend } from "resend";
import { format } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/cron/daily-digest
//
// CRON_SECRET-gated. Wire in cron-job.org for 23:55 UTC daily (5:25 IST,
// just before the morning brief lands). Iterates all subscribed users and
// sends each a personalised digest via Resend. Idempotent via
// public.digest_sends — re-running on the same day is a no-op per user.

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromAddr = `Samvidya <${fromEmail}>`;
  const siteUrl = process.env.SITE_URL || "https://samvidya.com";

  const admin = createAdminClient();
  const today = format(new Date(), "yyyy-MM-dd");

  // Pull subscribers. Skip volunteers — they live in the PWA, not email.
  const { data: subscribers } = await admin
    .from("users")
    .select("id, email, full_name, role, active, daily_digest_enabled")
    .eq("daily_digest_enabled", true)
    .eq("active", true)
    .in("role", ["superadmin", "firm_admin", "firm_analyst", "firm_intern", "party_viewer"]);

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, note: "no subscribers" });
  }

  // Check who's already received today's digest
  const userIds = subscribers.map((u) => u.id);
  const { data: alreadySent } = await admin
    .from("digest_sends")
    .select("user_id")
    .eq("for_date", today)
    .in("user_id", userIds);
  const sentSet = new Set((alreadySent ?? []).map((s) => s.user_id));

  const results: { email: string; status: "sent" | "skipped" | "error"; note?: string }[] = [];
  for (const sub of subscribers) {
    if (sentSet.has(sub.id)) {
      results.push({ email: sub.email, status: "skipped", note: "already sent today" });
      continue;
    }
    try {
      const data = await buildDigestData({
        user_id: sub.id,
        email: sub.email,
        full_name: sub.full_name,
        role: sub.role,
      });
      const html = renderDigestHtml(
        { user_id: sub.id, email: sub.email, full_name: sub.full_name, role: sub.role },
        data,
        siteUrl,
      );
      const send = await resend.emails.send({
        from: fromAddr,
        to: sub.email,
        subject: `Samvidya · daily digest · ${data.date_label.split(",")[1]?.trim() ?? data.date_label}`,
        html,
      });
      if (send.error) throw new Error(send.error.message);

      await admin.from("digest_sends").insert({
        user_id: sub.id,
        for_date: today,
        resend_message_id: send.data?.id ?? null,
        item_count: data.top_signals.length + data.watchlist_activity.length + data.urgent_narratives.length,
      });
      await admin.from("users").update({ daily_digest_last_sent_at: new Date().toISOString() }).eq("id", sub.id);

      results.push({ email: sub.email, status: "sent" });
    } catch (e) {
      results.push({ email: sub.email, status: "error", note: (e as Error).message });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    ok: true,
    date: today,
    subscribers: subscribers.length,
    sent, skipped, errors,
    errors_detail: results.filter((r) => r.status === "error"),
  });
}

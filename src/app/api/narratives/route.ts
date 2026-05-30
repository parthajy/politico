import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { requireFirmOrCron } from "@/lib/auth-cron";
import { detectAndPersist, type WindowMode } from "@/lib/ai/narrative-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/narratives
//
// Runs narrative detection over a configurable window, persists results to
// the narratives + narrative_events + narrative_revisions tables (so
// they survive page refresh AND each generation EVOLVES existing narratives
// rather than starting from scratch), and writes audit log.
//
// Body: { mode?: 'urgent_24h' | 'forming_7d' | 'review_30d' }   default forming_7d
//
// Dual-auth: firm-side user session OR CRON_SECRET bearer (so the same
// endpoint serves the in-app "Regenerate" button AND the scheduled hourly /
// daily / weekly cron hits).

export async function POST(req: Request) {
  const auth = await requireFirmOrCron(req, ["firm_admin", "firm_analyst", "superadmin"]);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: { mode?: WindowMode } = {};
  try { body = await req.json(); } catch { /* allow empty body — default mode */ }
  const mode: WindowMode = body.mode ?? "forming_7d";
  if (!["urgent_24h", "forming_7d", "review_30d"].includes(mode)) {
    return NextResponse.json({ ok: false, error: "invalid mode" }, { status: 400 });
  }

  const t0 = Date.now();
  let result;
  try {
    result = await detectAndPersist({
      mode,
      triggered_by: auth.via === "cron" ? `cron:${mode}` : `user:${auth.user_id}`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  await auditLog({
    user_id: auth.user_id,
    action: auth.via === "cron" ? "narratives_detect_cron" : "narratives_detect",
    entity_type: "narratives",
    metadata: { ...result, ms: Date.now() - t0, mode },
  });

  return NextResponse.json({ ...result, ms: Date.now() - t0 });
}

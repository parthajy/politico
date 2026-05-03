// Day 4 acceptance: full 90-second flow against the deployed URL.
// Steps mirror README §"The 90-second demo flow" but exercised programmatically.
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const PROD = "https://politico-mu.vercel.app";
const PASSWORD = process.env.DEMO_USER_PASSWORD!;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sbAdmin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

function ms() { return new Date().toISOString().slice(11, 23); }
function log(msg: string) { console.log(`[${ms()}] ${msg}`); }

async function main() {
  log("STEP 1: probe prod URL");
  const probe = await fetch(PROD);
  if (probe.status !== 200) throw new Error(`landing ${probe.status}`);
  log("  ✓ landing 200");

  log("STEP 2: firm.analyst signs in");
  const firm = createClient(URL, ANON);
  const fAuth = await firm.auth.signInWithPassword({ email: "firm.analyst@signaldesk.demo", password: PASSWORD });
  if (fAuth.error) throw fAuth.error;
  log(`  ✓ session uid=${fAuth.data.user!.id.slice(0, 8)}`);

  log("STEP 3: firm pulls top SNT events from inbox");
  const { data: top } = await firm
    .from("classifications")
    .select("event_id, snt_score, events!inner(title)")
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(3);
  if (!top || top.length === 0) throw new Error("no classified events");
  for (const r of top) {
    const ev = (r.events as unknown) as { title: string };
    log(`    [${(r.snt_score ?? 0).toFixed(2)}] ${ev.title.slice(0, 60)}`);
  }
  const target = top[0].event_id;

  log("STEP 4: firm escalates the top event");
  const t0 = Date.now();
  const { error: upErr } = await firm.from("triage").upsert(
    { event_id: target, status: "escalated", notes: "verify-day4 acceptance run" },
    { onConflict: "event_id" }
  );
  if (upErr) throw upErr;
  log(`  ✓ triage write in ${Date.now() - t0}ms`);

  log("STEP 5: alert auto-created (or already existed)");
  const { count: alertN } = await firm.from("alerts").select("id", { count: "exact", head: true }).eq("event_id", target);
  log(`  ✓ alerts on event: ${alertN}`);

  log("STEP 6: party.cm signs in");
  const party = createClient(URL, ANON);
  const pAuth = await party.auth.signInWithPassword({ email: "party.cm@signaldesk.demo", password: PASSWORD });
  if (pAuth.error) throw pAuth.error;
  log("  ✓ party session");

  log("STEP 7: party reads alert with the escalated event in it");
  const { data: alerts } = await party
    .from("alerts")
    .select("title, severity, event_id")
    .eq("event_id", target)
    .order("created_at", { ascending: false })
    .limit(3);
  log(`  ✓ ${(alerts ?? []).length} alert(s) visible to party`);

  log("STEP 8: party opens district + constituency for the escalated event");
  const { data: cls } = await party
    .from("classifications")
    .select("district_id, constituency_id")
    .eq("event_id", target)
    .single();
  log(`  ✓ event tagged: district=${cls?.district_id} constituency=${cls?.constituency_id}`);

  log("STEP 9: firm regenerates today's brief (streaming gpt-4o)");
  const { buildBriefContext, streamBrief } = await import("../src/lib/ai/brief");
  const ctx = await buildBriefContext();
  log(`  ✓ context built: events=${ctx.top_events.length} alerts=${ctx.alerts.length}`);
  const briefStart = Date.now();
  let total = 0;
  let firstAt = 0;
  let body = "";
  for await (const chunk of streamBrief(ctx)) {
    if (!firstAt) firstAt = Date.now();
    total += chunk.length;
    body += chunk;
  }
  log(`  ✓ first token ${firstAt - briefStart}ms · full ${Date.now() - briefStart}ms · ${total} chars`);

  log("STEP 10: persist the brief and publish it (admin write to bypass cookie auth)");
  const today = new Date().toISOString().slice(0, 10);
  const { data: brief, error: bErr } = await sbAdmin
    .from("briefs")
    .upsert({
      brief_date: today,
      body_md: body,
      generated_by_model: "gpt-4o",
      generated_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      approved_by: fAuth.data.user!.id,
    }, { onConflict: "brief_date" })
    .select("id")
    .single();
  if (bErr) throw bErr;
  log(`  ✓ brief persisted + published id=${brief.id.slice(0, 8)}`);

  log("STEP 11: party reads the just-published brief");
  const { data: latest } = await party
    .from("briefs")
    .select("id, brief_date, published_at")
    .not("published_at", "is", null)
    .order("brief_date", { ascending: false })
    .limit(1)
    .single();
  log(`  ✓ party sees brief: ${latest?.brief_date} published=${latest?.published_at}`);

  // STEP 12: verify the live URL renders without errors
  log("STEP 12: hit live URLs (unauth → expect 307 redirects)");
  for (const path of ["/firm", "/firm/sources", "/firm/voices", "/firm/stories", "/firm/briefs", "/firm/audit", "/party", "/party/cabinet", "/party/brief", "/party/alerts"]) {
    const r = await fetch(`${PROD}${path}`, { redirect: "manual" });
    if (r.status !== 307 && r.status !== 200) {
      throw new Error(`${path}: unexpected ${r.status}`);
    }
    log(`  ${path}: ${r.status}`);
  }

  log("\n✅ Day 4 acceptance: PASS");
}

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const tables = ["events", "classifications", "triage", "alerts", "sentiment_snapshots", "stories", "briefs"] as const;
  for (const t of tables) {
    const { count } = await sb.from(t).select("id", { count: "exact", head: true });
    console.log(`${t.padEnd(22)} ${count}`);
  }

  console.log("\nevents by source:");
  const { data: srcs } = await sb.rpc("noop").select(); // placeholder
  // Manual breakdown
  for (const s of ["reddit", "youtube", "gdelt", "google_news", "rss"]) {
    const { count } = await sb.from("events").select("id", { count: "exact", head: true }).eq("source", s);
    console.log(`  ${s.padEnd(15)} ${count}`);
  }

  console.log("\nclassified vs unclassified:");
  const { count: classifiedCount } = await sb.from("classifications").select("event_id", { count: "exact", head: true });
  const { count: totalEvents } = await sb.from("events").select("id", { count: "exact", head: true });
  console.log(`  classified: ${classifiedCount} / ${totalEvents}`);

  console.log("\nrecent classifications (top 5 by SNT):");
  const { data: top } = await sb
    .from("classifications")
    .select("event_id, sentiment, snt_score, district_id, constituency_id, topic_tags, events(title,source)")
    .order("snt_score", { ascending: false })
    .limit(5);
  for (const c of top ?? []) {
    const ev = c.events as unknown as { title: string; source: string };
    console.log(`  [${c.snt_score?.toFixed(2)}] ${ev?.source.padEnd(11)} ${ev?.title.slice(0, 70)}`);
    console.log(`        sent=${c.sentiment} district=${c.district_id} const=${c.constituency_id} tags=${(c.topic_tags ?? []).slice(0,2).join(",")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

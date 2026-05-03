// Backfill classifier — picks up every event without a classification row
// and runs it through the OpenAI classifier in batches.
// Idempotent: safe to re-run; only classifies what's missing.
//
// Run with: npx tsx scripts/classify-pending.ts

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { classifyAndPersist } from "../src/lib/ingest";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Pull every classified event id once. With <100k events this is fine.
  const { data: classified, error: cErr } = await sb.from("classifications").select("event_id");
  if (cErr) throw cErr;
  const classifiedSet = new Set((classified ?? []).map((c) => c.event_id));
  console.log(`already classified: ${classifiedSet.size}`);

  // Pull all events.
  let pageFrom = 0;
  const PAGE = 1000;
  const pending: { id: string; source: string; source_id: string; title: string; body: string | null; url: string | null }[] = [];
  while (true) {
    const { data, error } = await sb
      .from("events")
      .select("id, source, source_id, title, body, url, published_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(pageFrom, pageFrom + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const e of data) {
      if (!classifiedSet.has(e.id)) {
        pending.push({ id: e.id, source: e.source, source_id: e.source_id, title: e.title ?? "", body: e.body, url: e.url });
      }
    }
    if (data.length < PAGE) break;
    pageFrom += PAGE;
  }
  console.log(`pending classification: ${pending.length}`);

  if (pending.length === 0) return;

  // Process with parallel workers. Each worker takes a small slice and runs
  // classifyAndPersist (which itself batches 5 events per OpenAI call).
  const PARALLEL = 4;
  const CHUNK = 10; // 2 batches of 5 per chunk
  const chunks: typeof pending[] = [];
  for (let i = 0; i < pending.length; i += CHUNK) chunks.push(pending.slice(i, i + CHUNK));

  let totalClassified = 0;
  let chunkIdx = 0;
  const t0 = Date.now();

  async function worker(workerId: number) {
    while (true) {
      const my = chunkIdx++;
      if (my >= chunks.length) return;
      const slice = chunks[my];
      const cs0 = Date.now();
      try {
        const n = await classifyAndPersist(slice as unknown as Parameters<typeof classifyAndPersist>[0]);
        totalClassified += n;
        const elapsed = Date.now() - t0;
        const eta = Math.round((elapsed / (my + 1)) * (chunks.length - my - 1) / 1000);
        console.log(`  w${workerId} chunk ${my + 1}/${chunks.length}: +${n} (${(Date.now() - cs0) / 1000}s) total=${totalClassified} eta=${eta}s`);
      } catch (e) {
        console.error(`  w${workerId} chunk ${my + 1}: ✗ ${(e as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, (_, i) => worker(i + 1)));
  console.log(`\ndone — classified ${totalClassified} events in ${(Date.now() - t0) / 1000}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });

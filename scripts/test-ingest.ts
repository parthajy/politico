// Local end-to-end smoke test: runs each fetcher, persists+classifies a few events.
// Run with: npx tsx scripts/test-ingest.ts
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { fetchReddit } from "../src/lib/sources/reddit";
import { fetchGdelt } from "../src/lib/sources/gdelt";
import { fetchRss } from "../src/lib/sources/rss";
import { fetchYouTube } from "../src/lib/sources/youtube";
import { persistAndClassify } from "../src/lib/ingest";

function log(msg: string) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    log(`${label} ✓ ${Date.now() - t0}ms`);
    return out;
  } catch (e) {
    log(`${label} ✗ ${(e as Error).message}`);
    throw e;
  }
}

async function main() {
  log("starting fetch round (each source individually, with progress)");
  const reddit = await timed("reddit", fetchReddit);
  log(`  reddit: ${reddit.fetched} events`);
  const gdelt = await timed("gdelt", fetchGdelt);
  log(`  gdelt: ${gdelt.fetched} events`);
  const rss = await timed("rss", fetchRss);
  log(`  rss/google_news: ${rss.fetched} events`);
  const yt = await timed("youtube", fetchYouTube);
  log(`  youtube: ${yt.fetched} events`);

  const all = [...reddit.events, ...gdelt.events, ...rss.events, ...yt.events];
  log(`total fetched: ${all.length}`);
  log(`persisting + classifying (this calls OpenAI)...`);
  const out = await persistAndClassify(all);
  log(`done. inserted=${out.inserted} classified=${out.classified}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

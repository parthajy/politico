import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { fetchReddit } from "../src/lib/sources/reddit";
import { fetchGdelt } from "../src/lib/sources/gdelt";

(async () => {
  const t1 = Date.now();
  const r = await fetchReddit();
  console.log(`reddit (RSS): ${r.fetched} events in ${Date.now() - t1}ms`);
  for (const e of r.events.slice(0, 4)) console.log(`  · ${e.title.slice(0, 75)}`);
  const t2 = Date.now();
  const g = await fetchGdelt();
  console.log(`gdelt: ${g.fetched} events in ${Date.now() - t2}ms`);
})().catch((e) => { console.error(e); process.exit(1); });

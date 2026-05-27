import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { extractUrl } from "../src/lib/intake/extract";

(async () => {
  const urls = [
    "https://www.thehindu.com/news/national/other-states/",
    "https://arunachaltimes.in/",
  ];
  for (const u of urls) {
    try {
      const t0 = Date.now();
      const r = await extractUrl(u);
      console.log(`\n${u} (${Date.now() - t0}ms)`);
      console.log(`  title: ${r.title.slice(0, 70)}`);
      console.log(`  desc:  ${(r.description ?? "—").slice(0, 70)}`);
      console.log(`  site:  ${r.site_name ?? "—"}`);
      console.log(`  excerpt(120): ${(r.text_excerpt ?? "").slice(0, 120)}`);
    } catch (e) {
      console.log(`\n${u}\n  ERROR: ${(e as Error).message}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });

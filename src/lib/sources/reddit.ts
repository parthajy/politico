import type { FetchResult, RawEvent } from "./types";
import { fetchWithTimeout } from "./util";

const SUBREDDITS = ["arunachalpradesh", "northeastindia", "india", "IndiaSpeaks"];
const UA = "SignalDesk/0.1 (political-intel-research)";

type RedditChild = {
  kind: string;
  data: {
    id: string;
    title: string;
    selftext?: string;
    permalink: string;
    url?: string;
    created_utc: number;
    subreddit: string;
    author: string;
    num_comments: number;
    score: number;
    is_self: boolean;
  };
};

export async function fetchReddit(): Promise<FetchResult> {
  const events: RawEvent[] = [];
  for (const sub of SUBREDDITS) {
    try {
      const r = await fetchWithTimeout(
        `https://www.reddit.com/r/${sub}/new.json?limit=25`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, next: { revalidate: 0 } } as RequestInit,
      );
      if (!r.ok) {
        console.warn(`reddit ${sub} → ${r.status}`);
        continue;
      }
      const json = (await r.json()) as { data: { children: RedditChild[] } };
      for (const c of json.data.children) {
        const d = c.data;
        // Only keep posts that look AP-relevant for the broad subs
        if (sub !== "arunachalpradesh" && sub !== "northeastindia") {
          if (!isApRelevant(d.title) && !isApRelevant(d.selftext ?? "")) continue;
        }
        events.push({
          source: "reddit",
          source_id: `t3_${d.id}`,
          url: `https://www.reddit.com${d.permalink}`,
          title: d.title,
          body: d.selftext || null,
          published_at: new Date(d.created_utc * 1000).toISOString(),
          raw_payload: {
            subreddit: d.subreddit,
            author: d.author,
            num_comments: d.num_comments,
            score: d.score,
            is_self: d.is_self,
            external_url: d.url,
          },
        });
      }
    } catch (e) {
      console.warn(`reddit ${sub} fetch error: ${(e as Error).message}`);
    }
  }
  return { source: "reddit", fetched: events.length, events };
}

const AP_KEYWORDS = [
  "arunachal", "itanagar", "tawang", "pasighat", "pema khandu", "chowna mein",
  "siang", "subansiri", "ziro", "mechuka", "namsai", "nyishi", "monpa", "apatani",
  "northeast india", "ne india", "lac china", "border infrastructure",
];
function isApRelevant(text: string) {
  const t = text.toLowerCase();
  return AP_KEYWORDS.some((k) => t.includes(k));
}

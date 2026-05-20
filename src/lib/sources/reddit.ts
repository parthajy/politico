import type { FetchResult, RawEvent } from "./types";
import { fetchWithTimeout } from "./util";

// Reddit's JSON API (/new.json) hard-rate-limits datacenter IPs (Vercel) with
// 429s. The per-subreddit RSS feed (/new/.rss) is served from Reddit's CDN and
// is far more permissive — so we read that instead and parse the Atom XML.

const SUBREDDITS = ["arunachalpradesh", "northeastindia", "india", "IndiaSpeaks"];
const UA = "Samvidya/1.0 (political-intelligence-research; contact: desk@samvidya.app)";

const AP_KEYWORDS = [
  "arunachal", "itanagar", "tawang", "pasighat", "pema khandu", "chowna mein",
  "siang", "subansiri", "ziro", "mechuka", "namsai", "nyishi", "monpa", "apatani",
  "northeast india", "ne india", "lac china", "border infrastructure",
];
function isApRelevant(text: string) {
  const t = text.toLowerCase();
  return AP_KEYWORDS.some((k) => t.includes(k));
}

type AtomEntry = { id: string; title: string; link: string; published: string; content: string };

function parseAtom(xml: string): AtomEntry[] {
  const out: AtomEntry[] = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const inner = m[1];
    out.push({
      id: tag(inner, "id"),
      title: clean(tag(inner, "title")),
      link: linkHref(inner),
      published: tag(inner, "published") || tag(inner, "updated"),
      content: clean(tag(inner, "content")),
    });
  }
  return out;
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m?.[1] ?? "";
}
function linkHref(xml: string): string {
  const m = xml.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m?.[1] ?? "";
}
function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchReddit(): Promise<FetchResult> {
  const events: RawEvent[] = [];
  for (const sub of SUBREDDITS) {
    try {
      const r = await fetchWithTimeout(
        `https://www.reddit.com/r/${sub}/new/.rss?limit=25`,
        { headers: { "User-Agent": UA, Accept: "application/atom+xml, application/xml" }, next: { revalidate: 0 } } as RequestInit,
        8000,
      );
      if (!r.ok) {
        console.warn(`reddit ${sub} → ${r.status}`);
        continue;
      }
      const xml = await r.text();
      const entries = parseAtom(xml).slice(0, 25);
      for (const e of entries) {
        if (!e.id || !e.title) continue;
        // For broad subs, keep only AP-relevant posts
        if (sub !== "arunachalpradesh" && sub !== "northeastindia") {
          if (!isApRelevant(e.title) && !isApRelevant(e.content)) continue;
        }
        events.push({
          source: "reddit",
          source_id: e.id.startsWith("t3_") ? e.id : `t3_${e.id.split("/").pop()}`,
          url: e.link || null,
          title: e.title,
          body: e.content || null,
          published_at: e.published ? new Date(e.published).toISOString() : null,
          raw_payload: { subreddit: sub, via: "rss" },
        });
      }
    } catch (e) {
      console.warn(`reddit ${sub} fetch error: ${(e as Error).message}`);
    }
  }
  return { source: "reddit", fetched: events.length, events };
}

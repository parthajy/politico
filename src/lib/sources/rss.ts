import type { FetchResult, RawEvent, EventSource } from "./types";
import { fetchWithTimeout } from "./util";

// Indian outlets + Google News searches.
// We treat Google News results as source='google_news'; all others as source='rss'.
type Feed = { url: string; source: EventSource; tag?: string };

const INDIAN_OUTLET_FEEDS: Feed[] = [
  // Indian outlet RSS — use search/topic feeds where state-specific feeds aren't published.
  { url: "https://www.thehindu.com/news/national/other-states/feeder/default.rss", source: "rss", tag: "thehindu" },
  { url: "https://indianexpress.com/section/north-east-india/feed/", source: "rss", tag: "indian_express" },
  { url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", source: "rss", tag: "hindustan_times" },
  { url: "https://feeds.feedburner.com/ndtvnews-india-news", source: "rss", tag: "ndtv" },
  { url: "https://arunachaltimes.in/index.php/feed/", source: "rss", tag: "arunachal_times" },
  { url: "https://arunachalfront.com/feed/", source: "rss", tag: "arunachal_front" },
];

// Google News RSS — one per Tier-1 district + per CM/DyCM + per top issue.
// The query goes in `q`, geo-restricted to India.
function gnews(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}
const GOOGLE_NEWS_FEEDS: Feed[] = [
  // Tier 1 districts
  { url: gnews("Itanagar Arunachal Pradesh"), source: "google_news", tag: "itanagar" },
  { url: gnews("Tawang Arunachal"), source: "google_news", tag: "tawang" },
  { url: gnews("East Siang Pasighat"), source: "google_news", tag: "east_siang" },
  { url: gnews("West Kameng Bomdila"), source: "google_news", tag: "west_kameng" },
  { url: gnews("Changlang Arunachal"), source: "google_news", tag: "changlang" },
  // Cabinet
  { url: gnews('"Pema Khandu"'), source: "google_news", tag: "cm_khandu" },
  { url: gnews('"Chowna Mein"'), source: "google_news", tag: "dycm_mein" },
  // Top issues
  { url: gnews("Arunachal China LAC border"), source: "google_news", tag: "issue_lac" },
  { url: gnews("Arunachal road connectivity"), source: "google_news", tag: "issue_roads" },
  { url: gnews("Arunachal Pradesh hydropower Siang"), source: "google_news", tag: "issue_hydropower" },
];

const ALL_FEEDS = [...INDIAN_OUTLET_FEEDS, ...GOOGLE_NEWS_FEEDS];

// Tiny RSS/Atom parser — extracts what we need without a dependency.
type ParsedItem = { title: string; link: string; guid: string; pubDate: string; description: string };

function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  // Match either <item>...</item> (RSS) or <entry>...</entry> (Atom)
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const inner = m[1] ?? m[2] ?? "";
    items.push({
      title: cleanText(field(inner, "title")),
      link: extractLink(inner),
      guid: cleanText(field(inner, "guid") || field(inner, "id") || extractLink(inner)),
      pubDate: cleanText(field(inner, "pubDate") || field(inner, "published") || field(inner, "updated")),
      description: cleanText(field(inner, "description") || field(inner, "summary") || field(inner, "content")),
    });
  }
  return items;
}

function field(xml: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const m = xml.match(re);
  return m?.[1] ?? "";
}

function extractLink(xml: string): string {
  // RSS: <link>https://...</link>; Atom: <link href="https://..." />
  const direct = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (direct?.[1]?.trim()) return cleanText(direct[1]);
  const atom = xml.match(/<link[^>]*href=["']([^"']+)["']/i);
  return atom?.[1] ?? "";
}

function cleanText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

const AP_KEYWORDS = [
  "arunachal", "itanagar", "tawang", "pasighat", "pema khandu", "chowna mein",
  "siang", "subansiri", "ziro", "mechuka", "namsai", "nyishi", "monpa", "apatani",
  "northeast india",
];
function isApRelevant(text: string) {
  const t = text.toLowerCase();
  return AP_KEYWORDS.some((k) => t.includes(k));
}

export async function fetchRss(): Promise<FetchResult> {
  const events: RawEvent[] = [];
  await Promise.all(
    ALL_FEEDS.map(async (feed) => {
      try {
        const r = await fetchWithTimeout(
          feed.url,
          { headers: { "User-Agent": "SignalDesk/0.1 RSS aggregator" }, next: { revalidate: 0 } } as RequestInit,
          7000,
        );
        if (!r.ok) {
          console.warn(`rss ${feed.tag} → ${r.status}`);
          return;
        }
        const xml = await r.text();
        // Cap to 15 newest items per feed — keeps each cycle bounded.
        const items = parseRss(xml).slice(0, 15);
        for (const it of items) {
          // Keep only AP-relevant items for the broad national feeds
          const isBroad = feed.tag === "thehindu" || feed.tag === "hindustan_times" || feed.tag === "ndtv";
          if (isBroad && !isApRelevant(it.title) && !isApRelevant(it.description)) continue;
          events.push({
            source: feed.source,
            source_id: hash(it.guid || it.link || it.title),
            url: it.link || null,
            title: it.title || "(no title)",
            body: it.description || null,
            published_at: it.pubDate ? safeDate(it.pubDate) : null,
            raw_payload: { feed: feed.tag, feed_url: feed.url },
          });
        }
      } catch (e) {
        console.warn(`rss ${feed.tag} fetch error: ${(e as Error).message}`);
      }
    })
  );
  return { source: "rss", fetched: events.length, events };
}

function safeDate(s: string): string {
  const d = new Date(s);
  return isNaN(d.valueOf()) ? new Date().toISOString() : d.toISOString();
}

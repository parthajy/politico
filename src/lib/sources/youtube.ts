import type { FetchResult, RawEvent } from "./types";
import { fetchWithTimeout } from "./util";

// YouTube Data API v3 — search.list costs 100 units; daily free quota is 10000.
// Two queries per cycle keeps us well under quota.
const QUERIES = [
  "Arunachal Pradesh",
  "Pema Khandu Arunachal",
];

type YtSearchItem = {
  id: { videoId?: string };
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelTitle: string;
    thumbnails?: Record<string, { url: string }>;
  };
};

export async function fetchYouTube(): Promise<FetchResult> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.warn("youtube: YOUTUBE_API_KEY not set, skipping");
    return { source: "youtube", fetched: 0, events: [] };
  }

  const events: RawEvent[] = [];
  for (const q of QUERIES) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", q);
      url.searchParams.set("type", "video");
      url.searchParams.set("order", "date");
      url.searchParams.set("maxResults", "25");
      url.searchParams.set("relevanceLanguage", "en");
      url.searchParams.set("key", key);

      const r = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } } as RequestInit, 8000);
      if (!r.ok) {
        console.warn(`youtube "${q}" → ${r.status}`);
        continue;
      }
      const json = (await r.json()) as { items?: YtSearchItem[] };
      for (const it of json.items ?? []) {
        if (!it.id.videoId) continue;
        events.push({
          source: "youtube",
          source_id: it.id.videoId,
          url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
          title: it.snippet.title,
          body: it.snippet.description || null,
          published_at: it.snippet.publishedAt,
          raw_payload: {
            channel: it.snippet.channelTitle,
            query: q,
            thumbnail: it.snippet.thumbnails?.medium?.url ?? null,
          },
        });
      }
    } catch (e) {
      console.warn(`youtube "${q}" error: ${(e as Error).message}`);
    }
  }
  return { source: "youtube", fetched: events.length, events };
}

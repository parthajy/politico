import type { FetchResult, RawEvent } from "./types";
import { fetchWithTimeout } from "./util";

// GDELT 2.0 DOC API — public, no auth.
// Filter for India + Arunachal keywords; we get JSON list of articles.
const QUERY = '(arunachal OR itanagar OR tawang OR "pema khandu" OR "northeast india") sourcecountry:IN';
const ENDPOINT = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(QUERY)}&mode=artlist&format=json&maxrecords=50&sort=datedesc`;

type GdeltArticle = {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string; // YYYYMMDDTHHMMSSZ
  socialimage?: string;
  domain: string;
  language: string;
  sourcecountry: string;
};

function gdeltDate(s: string): string {
  // "20260103T122112Z" → "2026-01-03T12:21:12Z"
  if (!s || s.length !== 16) return new Date().toISOString();
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}

function hash(s: string): string {
  // Simple stable string hash for source_id when no native id exists.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function fetchGdelt(): Promise<FetchResult> {
  try {
    const r = await fetchWithTimeout(ENDPOINT, { next: { revalidate: 0 } } as RequestInit, 10000);
    if (!r.ok) {
      console.warn(`gdelt → ${r.status}`);
      return { source: "gdelt", fetched: 0, events: [] };
    }
    // GDELT sometimes returns JS-style content with malformed JSON; guard with try
    const text = await r.text();
    const json = JSON.parse(text) as { articles?: GdeltArticle[] };
    const articles = json.articles ?? [];
    const events: RawEvent[] = articles.map((a) => ({
      source: "gdelt",
      source_id: hash(a.url),
      url: a.url,
      title: a.title,
      body: null,
      published_at: gdeltDate(a.seendate),
      raw_payload: {
        domain: a.domain,
        language: a.language,
        sourcecountry: a.sourcecountry,
        socialimage: a.socialimage ?? null,
      },
    }));
    return { source: "gdelt", fetched: events.length, events };
  } catch (e) {
    console.warn(`gdelt fetch error: ${(e as Error).message}`);
    return { source: "gdelt", fetched: 0, events: [] };
  }
}

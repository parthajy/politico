import { fetchWithTimeout } from "@/lib/sources/util";

// Lightweight URL → metadata extractor for the intake pipeline.
// Pulls og:title / og:description / og:image (with reasonable fallbacks).
// No external deps — we parse with regex which is fine for meta tags.

export type ExtractedPage = {
  url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  author: string | null;
  published_at: string | null;
  text_excerpt: string | null;
  platform: string | null;       // 'X' / 'Facebook' / 'Instagram' / 'Threads' / null
  needs_screenshot: boolean;     // true when the platform is JS-walled
  extract_quality: "good" | "thin" | "empty";
};

// Platforms that block bot fetchers — URL alone won't yield content, a screenshot is needed.
const JS_WALLED: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^https?:\/\/(www\.)?(twitter|x)\.com\//i, name: "X" },
  { pattern: /^https?:\/\/(www\.|m\.)?facebook\.com\//i, name: "Facebook" },
  { pattern: /^https?:\/\/(www\.)?fb\.com\//i, name: "Facebook" },
  { pattern: /^https?:\/\/(www\.)?instagram\.com\//i, name: "Instagram" },
  { pattern: /^https?:\/\/(www\.)?threads\.net\//i, name: "Threads" },
  { pattern: /^https?:\/\/(www\.)?linkedin\.com\//i, name: "LinkedIn" },
];

export function detectPlatform(url: string): { platform: string | null; needs_screenshot: boolean } {
  for (const p of JS_WALLED) {
    if (p.pattern.test(url)) return { platform: p.name, needs_screenshot: true };
  }
  return { platform: null, needs_screenshot: false };
}

// Build a sensible title when OG metadata is missing.
function fallbackTitle(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return host;
    if (/^(x|twitter)\.com$/i.test(host) && parts.length >= 3 && parts[1] === "status") {
      return `X — @${parts[0]} · status ${parts[2].slice(0, 10)}…`;
    }
    if (/facebook\.com$/i.test(host)) {
      if (parts[0]?.startsWith("story.php")) return "Facebook — story";
      return `Facebook — @${parts[0]}${parts[1] ? ` · ${parts[1]}` : ""}`;
    }
    if (/instagram\.com$/i.test(host) && (parts[0] === "p" || parts[0] === "reel") && parts[1]) {
      return `Instagram — ${parts[0]} ${parts[1].slice(0, 12)}…`;
    }
    return `${host} — ${parts[parts.length - 1].slice(0, 60)}`;
  } catch {
    return url.slice(0, 100);
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 Samvidya/1.0";

function meta(html: string, key: string): string | null {
  // Match <meta property="og:title" content="..."> or name="..."
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]);
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
    "i"
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]) : null;
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : null;
}

function textExcerpt(html: string, maxChars = 1500): string {
  // Strip script/style first
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  // Pull the largest <article> if present, else <main>, else body
  const article = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const main = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const body = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  const root = article || main || body || cleaned;
  const text = root
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(text.slice(0, maxChars));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…");
}

export async function extractUrl(url: string): Promise<ExtractedPage> {
  try { new URL(url); } catch { throw new Error("Invalid URL"); }

  const { platform, needs_screenshot } = detectPlatform(url);

  const r = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.8",
      },
      redirect: "follow",
      next: { revalidate: 0 },
    } as RequestInit,
    10_000
  );
  if (!r.ok) throw new Error(`Fetch failed: HTTP ${r.status}`);

  const html = await r.text();
  const trimmed = html.slice(0, 250_000);

  const ogTitle =
    meta(trimmed, "og:title") ||
    meta(trimmed, "twitter:title") ||
    titleTag(trimmed);
  const description =
    meta(trimmed, "og:description") ||
    meta(trimmed, "twitter:description") ||
    meta(trimmed, "description");
  const image_url = meta(trimmed, "og:image") || meta(trimmed, "twitter:image");
  const site_name = meta(trimmed, "og:site_name");
  const author = meta(trimmed, "author") || meta(trimmed, "article:author");
  const published_at =
    meta(trimmed, "article:published_time") ||
    meta(trimmed, "og:updated_time") ||
    meta(trimmed, "date");
  const text_excerpt = textExcerpt(trimmed);

  // Quality heuristic: how much real content did we recover?
  const contentBytes = (description ?? "").length + (text_excerpt ?? "").length;
  let extract_quality: "good" | "thin" | "empty";
  if (contentBytes < 80) extract_quality = "empty";
  else if (contentBytes < 400) extract_quality = "thin";
  else extract_quality = "good";

  // Use a usable fallback title when OG missing — never return the bare "(no title)" sentinel.
  const title = ogTitle && ogTitle !== "(no title)" ? ogTitle : fallbackTitle(url);

  return {
    url,
    title,
    description,
    image_url,
    site_name,
    author,
    published_at,
    text_excerpt,
    platform,
    needs_screenshot,
    extract_quality,
  };
}

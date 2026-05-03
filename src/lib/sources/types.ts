export type EventSource = "reddit" | "youtube" | "gdelt" | "google_news" | "rss" | "manual";

export type RawEvent = {
  source: EventSource;
  source_id: string;
  url: string | null;
  title: string;
  body: string | null;
  published_at: string | null; // ISO
  raw_payload: Record<string, unknown>;
};

export type FetchResult = {
  source: EventSource;
  fetched: number;
  events: RawEvent[];
};

// Display helpers used across firm + party views.

export function sentimentBucket(s: number | null | undefined): "positive" | "neutral" | "negative" {
  if (s == null) return "neutral";
  if (s >= 0.15) return "positive";
  if (s <= -0.15) return "negative";
  return "neutral";
}

export function sentimentColor(s: number | null | undefined): string {
  // -1 → severity-1 red; 0 → muted; +1 → positive green
  if (s == null) return "var(--muted)";
  if (s <= -0.5) return "var(--severity-1)";
  if (s <= -0.15) return "var(--bronze)";
  if (s >= 0.5) return "var(--positive)";
  if (s >= 0.15) return "#5BA976";
  return "var(--muted)";
}

export function sntBadge(score: number): { label: string; variant: "s1" | "s2" | "s3" | "default" } {
  if (score >= 0.85) return { label: "S1", variant: "s1" };
  if (score >= 0.6) return { label: "S2", variant: "s2" };
  if (score >= 0.35) return { label: "S3", variant: "s3" };
  return { label: "Low", variant: "default" };
}

export function shortSource(s: string): string {
  switch (s) {
    case "google_news": return "GNews";
    case "youtube": return "YT";
    case "reddit": return "Reddit";
    case "gdelt": return "GDELT";
    case "rss": return "RSS";
    default: return s;
  }
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

export type Feed = {
  id: number;
  source: "rss" | "google_news";
  tag: string;
  display_name: string;
  url: string;
  is_broad: boolean;
  active: boolean;
  last_fetched_at: string | null;
  last_item_at: string | null;
  last_item_count: number | null;
  fetch_error: string | null;
};

export function FeedsSection({ feeds }: { feeds: Feed[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    source: "rss" as "rss" | "google_news",
    tag: "",
    display_name: "",
    url: "",
    is_broad: false,
  });

  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    try {
      const r = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Add failed"); return; }
      toast.success(`Added ${form.display_name} — will pull on the next ingest run`);
      setOpen(false);
      setForm({ source: "rss", tag: "", display_name: "", url: "", is_broad: false });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(tag: string, active: boolean) {
    if (busy) return;
    setBusy(tag);
    try {
      const r = await fetch(`/api/feeds/${tag}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Toggle failed"); return; }
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeFeed(tag: string, displayName: string) {
    if (!confirm(`Remove "${displayName}" from the feed registry? Past events stay; future ingest stops.`)) return;
    setBusy(tag);
    try {
      const r = await fetch(`/api/feeds/${tag}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Delete failed"); return; }
      toast.success("Removed");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-serif text-lg font-bold text-navy">Configured feeds · {feeds.length}</h2>
          <p className="mt-1 text-sm text-muted">
            Every individual RSS / Google News feed the ingest pipeline reads from. Toggle a feed off to stop pulling without
            losing its history.
          </p>
        </div>
        <Button variant="bronze" size="sm" onClick={() => setOpen(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add feed
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2/50 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Feed</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="w-24 px-3 py-2 text-left">Items (last)</th>
              <th className="w-32 px-3 py-2 text-left">Last fetched</th>
              <th className="w-24 px-3 py-2 text-left">Status</th>
              <th className="w-32 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {feeds.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">
                No feeds in the registry yet. Run migration 0015 to seed the default 27 feeds, then add more here.
              </td></tr>
            )}
            {feeds.map((f) => {
              const lastFetch = f.last_fetched_at ? new Date(f.last_fetched_at) : null;
              const ageHours = lastFetch ? (Date.now() - lastFetch.getTime()) / 3_600_000 : Infinity;
              const status = !f.active ? "off"
                : f.fetch_error ? "error"
                : !lastFetch ? "pending"
                : ageHours <= 6 ? "live"
                : ageHours <= 48 ? "recent"
                : ageHours <= 168 ? "idle"
                : "stale";
              const variant = status === "live" ? "positive"
                : status === "recent" ? "bronze-soft"
                : status === "error" || status === "stale" ? "s1-soft"
                : status === "off" ? "s3-soft"
                : "default";
              return (
                <tr key={f.tag} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-navy">{f.display_name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted truncate max-w-md" title={f.url}>{f.url}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Badge variant="default">{f.source === "rss" ? "RSS" : "Google News"}</Badge>
                    {f.is_broad && <Badge variant="bronze-soft" className="ml-1">AP-filter</Badge>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-navy">{f.last_item_count ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {lastFetch ? `${formatDistanceToNowStrict(lastFetch)} ago` : "never"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={variant as "positive" | "bronze-soft" | "s1-soft" | "s3-soft" | "default"}>{status}</Badge>
                    {f.fetch_error && <div className="mt-0.5 truncate text-[10px] text-severity-1" title={f.fetch_error}>{f.fetch_error}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => toggleActive(f.tag, f.active)}
                        disabled={busy === f.tag}
                        className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:border-bronze hover:text-bronze-dark"
                      >
                        {f.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => removeFeed(f.tag, f.display_name)}
                        disabled={busy === f.tag}
                        className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:border-severity-1 hover:text-severity-1"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-border bg-white shadow-soft-lg">
            <form onSubmit={addFeed}>
              <div className="flex items-start justify-between border-b border-border px-6 py-4">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-bronze">Sources</div>
                  <h2 className="mt-1 font-serif text-xl font-bold text-navy">Add a feed</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">✕</button>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <Label>Type</Label>
                  <div className="mt-1.5 flex gap-2">
                    {(["rss", "google_news"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm({ ...form, source: s })}
                        className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                          form.source === s
                            ? "border-bronze bg-bronze-soft text-bronze-dark"
                            : "border-border bg-white text-muted hover:bg-surface-2"
                        }`}
                      >
                        {s === "rss" ? "RSS / Atom feed" : "Google News search"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="tag">Tag (slug — lowercase + underscore)</Label>
                  <Input id="tag" required value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="e.g. arunachal_observer" />
                </div>
                <div>
                  <Label htmlFor="display_name">Display name</Label>
                  <Input id="display_name" required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Arunachal Observer · daily" />
                </div>
                <div>
                  <Label htmlFor="url">{form.source === "rss" ? "RSS / Atom URL" : "Google News search URL"}</Label>
                  <Input id="url" type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={form.source === "rss" ? "https://example.com/feed.rss" : "https://news.google.com/rss/search?q=…"} />
                  {form.source === "google_news" && (
                    <p className="mt-1 text-[11px] text-muted">
                      Build the URL: <span className="font-mono">news.google.com/rss/search?q=YOUR+QUERY&hl=en-IN&gl=IN&ceid=IN:en</span>
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
                  <input
                    id="is_broad"
                    type="checkbox"
                    checked={form.is_broad}
                    onChange={(e) => setForm({ ...form, is_broad: e.target.checked })}
                    className="mt-0.5"
                  />
                  <label htmlFor="is_broad" className="flex-1 text-[11px] leading-relaxed text-muted">
                    <span className="font-medium text-navy">Apply AP-relevance filter</span> — for national-coverage feeds (PIB, ToI, NDTV, generic X searches).
                    Items must mention Arunachal / Itanagar / Tawang etc. or they&apos;re dropped. Leave OFF for AP-specific feeds (Arunachal Times, district-targeted Google News, ministers&apos; personal X handles).
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/30 px-6 py-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy === "create"}>Cancel</Button>
                <Button type="submit" variant="bronze" disabled={busy === "create"}>{busy === "create" ? "Adding…" : "Add feed"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

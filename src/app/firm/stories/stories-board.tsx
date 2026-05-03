"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Story = {
  id: string;
  title: string;
  status: "idea" | "in_production" | "published";
  outlet: string | null;
  url: string | null;
  reach_estimate: number | null;
  published_at: string | null;
  district: string | null;
  constituency: string | null;
  voice: string | null;
};

const COLUMNS: { key: Story["status"]; label: string; description: string }[] = [
  { key: "idea", label: "Ideas", description: "Tagged from signals; not yet started." },
  { key: "in_production", label: "In production", description: "Briefed to a partner outlet or local voice." },
  { key: "published", label: "Published", description: "Live with outlet, URL, and reach data." },
];

export function StoriesBoard({ initial }: { initial: Story[] }) {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>(initial);
  const [draftTitle, setDraftTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function setStatus(id: string, status: Story["status"]) {
    const prev = stories.find((s) => s.id === id)?.status;
    setStories((cur) => cur.map((s) => (s.id === id ? { ...s, status } : s)));
    const r = await fetch("/api/stories/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      // rollback
      setStories((cur) => cur.map((s) => (s.id === id && prev ? { ...s, status: prev } : s)));
      toast.error(j.error ?? "Status update failed");
      return;
    }
    toast.success(`Moved to ${status.replace("_", " ")}`);
    router.refresh();
  }

  async function createStory(e: React.FormEvent) {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    setCreating(true);
    const r = await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draftTitle }),
    });
    const j = await r.json();
    setCreating(false);
    if (!r.ok || !j.ok) {
      toast.error(j.error ?? "Create failed");
      return;
    }
    setStories((cur) => [{ ...j.story, district: null, constituency: null, voice: null }, ...cur]);
    setDraftTitle("");
    toast.success("Story idea created");
  }

  return (
    <div className="mt-6">
      <form onSubmit={createStory} className="mb-6 flex gap-2">
        <Input
          placeholder="New story idea — short title"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="max-w-md"
        />
        <Button type="submit" disabled={creating}>{creating ? "…" : "Add idea"}</Button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const inCol = stories.filter((s) => s.status === col.key);
          return (
            <Column key={col.key} col={col} count={inCol.length}>
              {inCol.map((s) => (
                <StoryCard key={s.id} s={s} onStatus={setStatus} />
              ))}
              {inCol.length === 0 && <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted">empty</div>}
            </Column>
          );
        })}
      </div>
    </div>
  );
}

function Column({ col, count, children }: { col: { key: Story["status"]; label: string; description: string }; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-sand-deep/30 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-serif text-base font-bold text-navy">{col.label}</h2>
        <span className="text-xs text-muted">{count}</span>
      </div>
      <p className="mb-3 text-xs text-muted">{col.description}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function StoryCard({ s, onStatus }: { s: Story; onStatus: (id: string, status: Story["status"]) => void }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3 pt-3">
        <div className="text-sm font-medium text-navy">
          {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a> : s.title}
        </div>
        <div className="flex flex-wrap gap-1 text-[10px]">
          {s.constituency && <Badge variant="default">{s.constituency}</Badge>}
          {s.district && !s.constituency && <Badge variant="default">{s.district}</Badge>}
          {s.voice && <Badge variant="bronze">via {s.voice}</Badge>}
          {s.outlet && <Badge variant="navy">{s.outlet}</Badge>}
          {s.reach_estimate && <Badge variant="outline">{(s.reach_estimate / 1000).toFixed(0)}k reach</Badge>}
        </div>
        <div className="flex gap-1 pt-1">
          {s.status !== "idea" && (
            <button onClick={() => onStatus(s.id, prevStatus(s.status))} className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:bg-sand">←</button>
          )}
          {s.status !== "published" && (
            <button onClick={() => onStatus(s.id, nextStatus(s.status))} className="rounded border border-bronze bg-bronze px-2 py-0.5 text-[10px] text-white hover:bg-bronze-dark">→</button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function nextStatus(s: Story["status"]): Story["status"] {
  if (s === "idea") return "in_production";
  if (s === "in_production") return "published";
  return "published";
}
function prevStatus(s: Story["status"]): Story["status"] {
  if (s === "published") return "in_production";
  if (s === "in_production") return "idea";
  return "idea";
}

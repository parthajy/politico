"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export function BriefEditor({ id, initialBody, published }: { id: string; initialBody: string; published: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">(published ? "preview" : "edit");
  const dirty = body !== initialBody;

  async function save() {
    setSaving(true);
    const r = await fetch(`/api/briefs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body_md: body }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok || !j.ok) { toast.error(j.error ?? "Save failed"); return; }
    toast.success("Saved");
    router.refresh();
  }

  async function publish() {
    if (dirty) { toast.error("Save your edits first"); return; }
    if (!confirm("Publish this brief? It becomes visible on the party view immediately.")) return;
    setPublishing(true);
    const r = await fetch(`/api/briefs/${id}`, { method: "POST" });
    const j = await r.json();
    setPublishing(false);
    if (!r.ok || !j.ok) { toast.error(j.error ?? "Publish failed"); return; }
    toast.success("Published");
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded border border-border bg-white p-1 text-xs">
          <button
            onClick={() => setMode("edit")}
            className={`rounded px-3 py-1 ${mode === "edit" ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
          >Edit</button>
          <button
            onClick={() => setMode("preview")}
            className={`rounded px-3 py-1 ${mode === "preview" ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
          >Preview</button>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/firm/briefs" className="text-xs text-muted hover:text-foreground">All briefs</Link>
          <Button size="sm" variant="outline" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save edits" : "Saved"}
          </Button>
          {!published && (
            <Button size="sm" variant="bronze" onClick={publish} disabled={publishing || dirty}>
              {publishing ? "Publishing…" : "Publish to party"}
            </Button>
          )}
          {published && (
            <Link href="/party/brief" className="text-xs text-bronze underline">View on party</Link>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {mode === "edit" ? (
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[60vh] rounded-none border-0 font-serif leading-relaxed focus-visible:ring-0"
              spellCheck
            />
          ) : (
            <div className="prose prose-sm max-w-none px-6 py-5 font-serif leading-relaxed">
              {renderMarkdown(body)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Tiny markdown renderer — just enough for our brief structure (headings + paragraphs).
function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  function flushPara() {
    if (para.length) {
      out.push(<p key={out.length} className="my-3">{para.join(" ")}</p>);
      para = [];
    }
  }
  for (const line of lines) {
    if (/^##\s/.test(line)) { flushPara(); out.push(<h2 key={out.length} className="mt-6 font-serif text-xl font-bold text-navy">{line.replace(/^##\s/, "")}</h2>); }
    else if (/^#\s/.test(line)) { flushPara(); out.push(<h1 key={out.length} className="mt-6 font-serif text-2xl font-bold text-navy">{line.replace(/^#\s/, "")}</h1>); }
    else if (line.trim() === "") { flushPara(); }
    else { para.push(line); }
  }
  flushPara();
  return out;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { toast } from "sonner";

const KINDS = [
  { v: "public_statement", l: "Public statement" },
  { v: "cabinet_decision", l: "Cabinet decision" },
  { v: "minister_directive", l: "Minister directive" },
  { v: "policy_change", l: "Policy change" },
  { v: "investigation", l: "Investigation" },
  { v: "visit", l: "Visit" },
  { v: "communication_freeze", l: "Communication freeze" },
  { v: "other", l: "Other" },
];

export function RecordDecisionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    summary: "",
    kind: "cabinet_decision",
    decided_by_role: "Cabinet",
    decided_on: new Date().toISOString().slice(0, 10),
    outcome: "",
    event_ids: "", // comma-separated UUIDs
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const event_ids = form.event_ids
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
      const r = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          summary: form.summary || null,
          kind: form.kind,
          decided_by_role: form.decided_by_role || null,
          decided_on: form.decided_on,
          outcome: form.outcome || null,
          triggering_event_ids: event_ids,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Save failed");
        return;
      }
      toast.success("Decision recorded");
      setOpen(false);
      setForm({ title: "", summary: "", kind: "cabinet_decision", decided_by_role: "Cabinet", decided_on: new Date().toISOString().slice(0, 10), outcome: "", event_ids: "" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="bronze" onClick={() => setOpen(true)}>Record decision</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-lg border border-border bg-white shadow-sm">
            <div className="border-b border-border bg-sand px-5 py-3">
              <h3 className="font-serif text-base font-bold text-navy">Record a decision</h3>
              <p className="mt-0.5 text-xs text-muted">Logs what was decided, when, by whom, and the signals that surfaced it.</p>
            </div>
            <form onSubmit={submit} className="space-y-3 px-5 py-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Convened Itanagar civil society on immigration" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Kind</Label>
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="mt-1 block h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
                    {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="dec_on">Decided on</Label>
                  <Input id="dec_on" type="date" value={form.decided_on} onChange={(e) => setForm({ ...form, decided_on: e.target.value })} />
                </div>
              </div>

              <div>
                <Label htmlFor="by">Decided by</Label>
                <Input id="by" value={form.decided_by_role} onChange={(e) => setForm({ ...form, decided_by_role: e.target.value })} placeholder="Cabinet · CM · Minister: Mama Natung · etc." />
              </div>

              <div>
                <Label htmlFor="sum">Summary</Label>
                <Textarea id="sum" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What was decided and why (2-4 sentences)" />
              </div>

              <div>
                <Label htmlFor="ev">Triggering signals (event IDs, comma-separated)</Label>
                <Textarea id="ev" value={form.event_ids} onChange={(e) => setForm({ ...form, event_ids: e.target.value })} placeholder="Paste event UUIDs from the inbox" />
                <p className="mt-1 text-[10px] text-muted">Copy these from the side panel of each event in the inbox. They become the audit trail.</p>
              </div>

              <div>
                <Label htmlFor="out">Observed outcome (optional, fill in later)</Label>
                <Textarea id="out" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} placeholder="What happened after?" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button type="submit" variant="bronze" disabled={busy || !form.title.trim()}>{busy ? "Saving…" : "Record"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

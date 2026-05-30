"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "sonner";

type District = { id: number; name: string };

const REL_STATUSES = [
  { v: "warm", l: "🤝 Warm", note: "Reliable, has placed before" },
  { v: "cool", l: "🌫️ Cool", note: "Open but inactive recently" },
  { v: "hostile", l: "⚠️ Hostile", note: "Burned us / refuses contact" },
  { v: "unknown", l: "❓ Unknown", note: "New / untested" },
] as const;

const COMMON_LANGS = ["English", "Hindi", "Assamese", "Nyishi", "Adi", "Apatani", "Monpa", "Tangsa"];

export function AddVoiceButton({ districts }: { districts: District[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "",
    outlet_name: "",
    district_id: "",
    contact_email: "",
    contact_phone: "",
    twitter: "",
    facebook: "",
    instagram: "",
    coverage_topics: "",
    languages: [] as string[],
    reach_estimate: "",
    relationship_status: "unknown" as "warm" | "cool" | "hostile" | "unknown",
    notes: "",
  });

  function reset() {
    setForm({
      name: "", role: "", outlet_name: "", district_id: "",
      contact_email: "", contact_phone: "",
      twitter: "", facebook: "", instagram: "",
      coverage_topics: "", languages: [],
      reach_estimate: "", relationship_status: "unknown", notes: "",
    });
  }

  function toggleLang(l: string) {
    setForm((f) => ({ ...f, languages: f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      const social_handles: Record<string, string> = {};
      if (form.twitter.trim()) social_handles.twitter = form.twitter.trim();
      if (form.facebook.trim()) social_handles.facebook = form.facebook.trim();
      if (form.instagram.trim()) social_handles.instagram = form.instagram.trim();

      const r = await fetch("/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role.trim() || null,
          outlet_name: form.outlet_name.trim() || null,
          district_id: form.district_id ? parseInt(form.district_id, 10) : null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          social_handles,
          coverage_topics: form.coverage_topics.split(",").map((s) => s.trim()).filter(Boolean),
          languages: form.languages,
          reach_estimate: form.reach_estimate ? parseInt(form.reach_estimate, 10) : null,
          relationship_status: form.relationship_status,
          notes: form.notes.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Add failed"); return; }
      toast.success(`Added ${form.name} to the voices CRM`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="bronze" onClick={() => setOpen(true)} size="sm">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add voice
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-2xl border border-border bg-white shadow-soft-lg my-8">
            <form onSubmit={submit}>
              <div className="flex items-start justify-between border-b border-border px-6 py-4">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-bronze">Voices CRM</div>
                  <h2 className="mt-1 font-serif text-xl font-bold text-navy">Add a voice</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">✕</button>
              </div>

              <div className="space-y-5 px-6 py-5">
                {/* Identity */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tanya Riba" />
                  </div>
                  <div>
                    <Label htmlFor="role">Role / title</Label>
                    <Input id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Journalist, activist, panchayat head…" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="outlet">Outlet / publication</Label>
                    <Input id="outlet" value={form.outlet_name} onChange={(e) => setForm({ ...form, outlet_name: e.target.value })} placeholder="Arunachal Times, EastMojo, Independent…" />
                  </div>
                  <div>
                    <Label htmlFor="district">District</Label>
                    <select id="district" value={form.district_id} onChange={(e) => setForm({ ...form, district_id: e.target.value })} className="mt-1 block h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
                      <option value="">— select —</option>
                      {districts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Relationship status */}
                <div>
                  <Label>Relationship status</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {REL_STATUSES.map((r) => (
                      <button
                        key={r.v}
                        type="button"
                        onClick={() => setForm({ ...form, relationship_status: r.v })}
                        className={`rounded-md border px-2.5 py-2 text-left text-[11px] transition ${
                          form.relationship_status === r.v
                            ? "border-bronze bg-bronze-soft text-bronze-dark"
                            : "border-border bg-white text-muted hover:bg-surface-2"
                        }`}
                      >
                        <div className="font-medium">{r.l}</div>
                        <div className="mt-0.5 text-[10px] opacity-80">{r.note}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contact */}
                <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted">Contact</div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="email" className="text-xs">Email</Label>
                      <Input id="email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-xs">Phone</Label>
                      <Input id="phone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="+91…" />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="x" className="text-xs">X (Twitter)</Label>
                      <Input id="x" value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} placeholder="@handle" />
                    </div>
                    <div>
                      <Label htmlFor="fb" className="text-xs">Facebook</Label>
                      <Input id="fb" value={form.facebook} onChange={(e) => setForm({ ...form, facebook: e.target.value })} placeholder="page or username" />
                    </div>
                    <div>
                      <Label htmlFor="ig" className="text-xs">Instagram</Label>
                      <Input id="ig" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@handle" />
                    </div>
                  </div>
                </div>

                {/* Coverage + reach */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="topics">Coverage topics (comma-separated)</Label>
                    <Input id="topics" value={form.coverage_topics} onChange={(e) => setForm({ ...form, coverage_topics: e.target.value })} placeholder="education, border infrastructure, tribal rights" />
                  </div>
                  <div>
                    <Label htmlFor="reach">Reach estimate (approx. followers)</Label>
                    <Input id="reach" type="number" min="0" value={form.reach_estimate} onChange={(e) => setForm({ ...form, reach_estimate: e.target.value })} placeholder="e.g. 8000" />
                  </div>
                </div>

                {/* Languages */}
                <div>
                  <Label>Languages</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {COMMON_LANGS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => toggleLang(l)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          form.languages.includes(l)
                            ? "border-bronze bg-bronze-soft text-bronze-dark"
                            : "border-border bg-white text-muted hover:bg-surface-2"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="notes">Internal notes</Label>
                  <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Anything we should remember — who introduced them, what they need, history of placements." />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/30 px-6 py-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button type="submit" variant="bronze" disabled={busy}>{busy ? "Saving…" : "Add voice"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

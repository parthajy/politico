"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "sonner";

type RoleOpt = "volunteer" | "firm_intern" | "firm_analyst" | "firm_admin" | "superadmin";

const ROLE_TABS: { v: RoleOpt; l: string; hint: string }[] = [
  { v: "volunteer", l: "Volunteer", hint: "Field network · token-based access (PWA)." },
  { v: "firm_intern", l: "Intern", hint: "Office triage · email only, signs in via OTP." },
  { v: "firm_analyst", l: "Analyst", hint: "Firm workbench · email only, signs in via OTP." },
  { v: "firm_admin", l: "Admin", hint: "Firm admin · sees audit log, otherwise like analyst." },
  { v: "superadmin", l: "Superadmin", hint: "Full access. Requires confirmation." },
];

export function TeamClient({ districts }: { districts: { id: number; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tokenJustIssued, setTokenJustIssued] = useState<{ name: string; token: string } | null>(null);
  const [form, setForm] = useState({
    role: "volunteer" as RoleOpt,
    full_name: "",
    email: "",
    phone: "",
    photo_url: "",
    district_id: "",
    languages: "",
    notes: "",
  });

  function reset() {
    setForm({ role: "volunteer", full_name: "", email: "", phone: "", photo_url: "", district_id: "", languages: "", notes: "" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    if (form.role !== "volunteer" && !form.email) {
      toast.error("This role needs an email (sign-in via OTP).");
      return;
    }
    if (form.role === "superadmin") {
      if (!confirm(`Create ANOTHER superadmin (${form.full_name})? They will have full system access.`)) return;
    }
    setBusy(true);
    try {
      const langs = form.languages.split(",").map((s) => s.trim()).filter(Boolean);
      const r = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: form.role,
          full_name: form.full_name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          photo_url: form.photo_url || undefined,
          district_id: form.district_id ? parseInt(form.district_id, 10) : null,
          languages: langs,
          notes: form.notes || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Create failed"); return; }
      if (j.token) {
        setTokenJustIssued({ name: form.full_name, token: j.token });
      } else {
        toast.success(`${labelFor(form.role)} created`);
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const showDistrict = form.role === "volunteer";
  const showLanguages = form.role === "volunteer";

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-muted">
          Volunteers get a token (PWA). Everyone else signs in via email OTP — no passwords stored.
        </p>
        <Button onClick={() => setOpen(true)} variant="bronze">Add team member</Button>
      </div>

      {open && (
        <Card className="mt-4 border-bronze/40">
          <CardContent className="py-5">
            <form onSubmit={submit} className="space-y-4">
              {/* Role tabs */}
              <div className="flex flex-wrap items-center gap-1 rounded border border-border bg-white p-1 text-xs">
                {ROLE_TABS.map((t) => (
                  <button
                    type="button"
                    key={t.v}
                    onClick={() => setForm({ ...form, role: t.v })}
                    className={`rounded px-3 py-1.5 ${form.role === t.v ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
                  >{t.l}</button>
                ))}
              </div>
              <p className="text-[11px] text-muted">{ROLE_TABS.find((t) => t.v === form.role)?.hint}</p>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="email">Email{form.role !== "volunteer" && " (required)"}</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={form.role === "volunteer" ? "optional" : "user@example.com"} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="photo">Photo URL</Label>
                  <Input id="photo" type="url" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://… (paste any image URL)" />
                </div>
              </div>

              {(showDistrict || showLanguages) && (
                <div className="grid gap-3 md:grid-cols-2">
                  {showDistrict && (
                    <div>
                      <Label htmlFor="dist">District</Label>
                      <select id="dist" value={form.district_id} onChange={(e) => setForm({ ...form, district_id: e.target.value })} className="mt-1 block h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
                        <option value="">— select —</option>
                        {districts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                      </select>
                    </div>
                  )}
                  {showLanguages && (
                    <div>
                      <Label htmlFor="langs">Languages (comma-separated)</Label>
                      <Input id="langs" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="English, Hindi, Nyishi" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="notes">Notes (internal)</Label>
                <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything we should remember about this person" />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button type="submit" variant="bronze" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {tokenJustIssued && (
        <Card className="mt-4 border-positive/40 bg-positive/5">
          <CardContent className="py-5">
            <div className="text-[10px] uppercase tracking-wider text-positive">Volunteer token · keep handy</div>
            <div className="mt-1 font-medium text-navy">{tokenJustIssued.name}</div>
            <p className="mt-2 text-xs text-muted">
              Share with the volunteer. They paste this into the PWA the first time. You can always view + rotate it from the volunteer&apos;s card below.
            </p>
            <div className="mt-3 break-all rounded border border-border bg-white px-3 py-2 font-mono text-xs">
              {tokenJustIssued.token}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(tokenJustIssued.token); toast.success("Copied"); }}>Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => setTokenJustIssued(null)}>Done</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function labelFor(r: RoleOpt): string {
  return ROLE_TABS.find((t) => t.v === r)?.l ?? r;
}

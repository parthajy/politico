"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "sonner";

export function TeamClient({ districts }: { districts: { id: number; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tokenJustIssued, setTokenJustIssued] = useState<{ name: string; token: string } | null>(null);
  const [form, setForm] = useState({
    role: "volunteer" as "volunteer" | "firm_intern",
    full_name: "",
    email: "",
    phone: "",
    photo_url: "",
    district_id: "",
    languages: "",  // comma-separated
    password: "",
    notes: "",
  });

  function reset() {
    setForm({ role: "volunteer", full_name: "", email: "", phone: "", photo_url: "", district_id: "", languages: "", password: "", notes: "" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    if (form.role === "firm_intern" && (!form.email || form.password.length < 8)) {
      toast.error("Interns need email + a password (8+ chars).");
      return;
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
          password: form.role === "firm_intern" ? form.password : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Create failed"); return; }
      if (j.token) {
        setTokenJustIssued({ name: form.full_name, token: j.token });
      } else {
        toast.success(`${form.role === "firm_intern" ? "Intern" : "Volunteer"} created`);
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

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-muted">
          Volunteers get a one-time installable token (used by the field PWA). Interns get email+password (used in the office).
        </p>
        <Button onClick={() => setOpen(true)} variant="bronze">Add team member</Button>
      </div>

      {open && (
        <Card className="mt-4 border-bronze/40">
          <CardContent className="py-5">
            <form onSubmit={submit} className="space-y-4">
              <div className="flex items-center gap-1 rounded border border-border bg-white p-1 text-xs w-fit">
                {([
                  { v: "volunteer", l: "Volunteer (field)" },
                  { v: "firm_intern", l: "Intern (office)" },
                ] as const).map((t) => (
                  <button
                    type="button"
                    key={t.v}
                    onClick={() => setForm({ ...form, role: t.v })}
                    className={`rounded px-3 py-1.5 ${form.role === t.v ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
                  >{t.l}</button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="email">Email{form.role === "firm_intern" && " (required)"}</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={form.role === "volunteer" ? "optional" : "intern@samvidya.app"} />
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

              {form.role === "volunteer" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="dist">District</Label>
                    <select id="dist" value={form.district_id} onChange={(e) => setForm({ ...form, district_id: e.target.value })} className="mt-1 block h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
                      <option value="">— select —</option>
                      {districts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="langs">Languages (comma-separated)</Label>
                    <Input id="langs" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="English, Hindi, Nyishi" />
                  </div>
                </div>
              )}

              {form.role === "firm_intern" && (
                <div>
                  <Label htmlFor="pw">Password (8+ chars)</Label>
                  <Input id="pw" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
              )}

              <div>
                <Label htmlFor="notes">Notes (internal)</Label>
                <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything the firm should remember about this person" />
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
            <div className="text-[10px] uppercase tracking-wider text-positive">Volunteer token · show once</div>
            <div className="mt-1 font-medium text-navy">{tokenJustIssued.name}</div>
            <p className="mt-2 text-xs text-muted">
              Share this with the volunteer. Once they install the PWA and sign in once, the token rotates and this code stops working. Keep it confidential.
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

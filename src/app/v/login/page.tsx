"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function VolunteerLogin() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) { toast.error("Paste your token"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Sign-in failed"); return; }
      toast.success(`Welcome${j.name ? `, ${j.name}` : ""}`);
      router.push("/v");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="container mx-auto flex max-w-sm flex-col items-center px-4 py-16">
        <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-8 w-auto" priority />
        <div className="mt-3 text-xs uppercase tracking-[0.2em] text-bronze">Field app</div>
        <h1 className="mt-2 font-serif text-2xl font-bold text-navy">Sign in with your token</h1>

        <Card className="mt-6 w-full">
          <CardContent className="py-5">
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="token">Token (from the desk)</Label>
                <Input
                  id="token"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="sv_v_…"
                  className="font-mono text-xs"
                />
              </div>
              <Button type="submit" variant="bronze" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-[10px] text-muted">
                Your token came from the analyst desk. If you forgot it, ask them to rotate.
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[10px] text-muted">
          Add to home screen for an app-like experience. On iOS: Share → Add to Home Screen.
        </p>
      </div>
    </main>
  );
}

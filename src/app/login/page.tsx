"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const DEMO_ACCOUNTS = [
  { email: "firm.admin@signaldesk.demo", label: "Firm — Admin", role: "firm_admin" },
  { email: "firm.analyst@signaldesk.demo", label: "Firm — Analyst", role: "firm_analyst" },
  { email: "party.cm@signaldesk.demo", label: "Party — CMO", role: "party_viewer" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.refresh();
    router.push("/firm");
  }

  function fillDemo(e: string) {
    setEmail(e);
    setPassword(process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "SignalDesk2026!");
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="container mx-auto flex max-w-md flex-col items-center justify-center px-6 py-24">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-9 w-auto" priority />
          <div className="mt-3 text-xs uppercase tracking-[0.2em] text-bronze">Political intelligence · Arunachal Pradesh</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Sign in</h1>
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Access the workbench</CardTitle>
            <CardDescription>Use your assigned credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={signIn} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" disabled={loading} className="mt-2">
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="mt-6 w-full">
          <div className="text-xs uppercase tracking-wider text-muted">Demo accounts</div>
          <div className="mt-2 flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => fillDemo(a.email)}
                className="flex items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-left text-sm hover:bg-sand-deep"
              >
                <span className="font-medium text-navy">{a.label}</span>
                <span className="text-xs text-muted">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

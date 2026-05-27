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
  { email: "super.partha@samvidya.demo", label: "Superadmin — Partha", role: "superadmin" },
  { email: "firm.admin@signaldesk.demo", label: "Firm — Admin", role: "firm_admin" },
  { email: "firm.analyst@signaldesk.demo", label: "Firm — Analyst", role: "firm_analyst" },
  { email: "party.cm@signaldesk.demo", label: "Party — CMO", role: "party_viewer" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email) { toast.error("Enter your email"); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Allow new users (interns we created) to confirm via this flow
        shouldCreateUser: false,
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setOtpSent(true);
    toast.success("Sign-in link sent — check your email");
  }

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    router.refresh();
    router.push("/firm");
  }

  function fillDemo(em: string) {
    setEmail(em);
    setPassword(process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "SignalDesk2026!");
    // Demo accounts know their password; default to password mode for them
    setMode("password");
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
            <CardTitle>Access the desk</CardTitle>
            <CardDescription>
              {mode === "otp" ? "We'll email you a sign-in link." : "Use your assigned password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* mode toggle */}
            <div className="mb-4 flex items-center gap-1 rounded border border-border bg-white p-1 text-xs w-fit">
              {([
                { v: "otp" as const, l: "Email me a link" },
                { v: "password" as const, l: "Use password" },
              ]).map((t) => (
                <button
                  key={t.v}
                  onClick={() => { setMode(t.v); setOtpSent(false); }}
                  className={`rounded px-3 py-1.5 ${mode === t.v ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
                >{t.l}</button>
              ))}
            </div>

            {mode === "otp" ? (
              otpSent ? (
                <div className="rounded border border-positive/40 bg-positive/5 p-3 text-sm text-foreground">
                  Sign-in link sent to <span className="font-medium">{email}</span>. Click it to land back here.
                  <button onClick={() => setOtpSent(false)} className="ml-2 text-xs text-bronze underline">Use a different email</button>
                </div>
              ) : (
                <form onSubmit={sendOtp} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </div>
                  <Button type="submit" disabled={loading} className="mt-2">
                    {loading ? "Sending…" : "Send sign-in link"}
                  </Button>
                </form>
              )
            ) : (
              <form onSubmit={signInPassword} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 w-full">
          <div className="text-xs uppercase tracking-wider text-muted">Demo accounts (password mode)</div>
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
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            Interns sign in with the email link only — no password. Field volunteers use the dedicated app at{" "}
            <a href="/v/login" className="text-bronze underline">/v/login</a> with the token issued by their desk.
          </p>
        </div>
      </div>
    </main>
  );
}

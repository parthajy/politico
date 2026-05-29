"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

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
        // Production: never auto-create accounts. The superadmin provisions
        // every user via /super/team before they can sign in.
        shouldCreateUser: false,
      },
    });
    setLoading(false);
    if (error) {
      // Don't leak whether the email exists — same response either way.
      toast.error("If this email is on the team, a sign-in link has been sent.");
      setOtpSent(true);
      return;
    }
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
    // Push to /firm — middleware will bounce by role (superadmin → /super,
    // party_viewer → /party, volunteer → /v).
    router.push("/firm");
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
              {mode === "otp"
                ? "Enter the email your desk registered. We'll send a sign-in link."
                : "Email + password (reserved for the few accounts with passwords set)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                  If <span className="font-medium">{email}</span> is on the team, a sign-in link is on its way. Click it from the same browser.
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
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
          Field volunteers use the dedicated app at{" "}
          <a href="/v/login" className="text-bronze underline">/v/login</a> with the token issued by their desk.
        </p>
      </div>
    </main>
  );
}

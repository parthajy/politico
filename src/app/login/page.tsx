"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Resend cooldown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  // Auto-focus code input when we move to step 2
  useEffect(() => {
    if (step === "code") {
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }
  }, [step]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email) { toast.error("Enter your email"); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // No emailRedirectTo → Supabase sends an OTP code instead of a magic link.
        // (If your Supabase email template still includes {{ .ConfirmationURL }},
        // the link will be present but unused — see /super docs for template setup.)
        shouldCreateUser: false,
      },
    });
    setLoading(false);
    if (error) {
      // Neutral message — never confirm whether an email is on the team.
      toast.message("If this email is on the team, a 6-digit code has been sent.");
    } else {
      toast.success("Code sent — check your email");
    }
    setStep("code");
    setSecondsLeft(60);
  }

  async function verifyCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length < 6) { toast.error("Enter the 6-digit code"); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.refresh();
    // Push to /firm — middleware bounces by role.
    router.push("/firm");
  }

  async function resend() {
    if (secondsLeft > 0) return;
    setCode("");
    await sendCode();
  }

  return (
    <main className="min-h-screen bg-surface">
      <div className="container mx-auto flex max-w-md flex-col items-center justify-center px-6 py-24">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-9 w-auto" priority />
          <div className="mt-3 text-xs uppercase tracking-[0.2em] text-bronze">Political intelligence · Arunachal Pradesh</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Sign in</h1>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{step === "email" ? "Enter your email" : "Enter the code from your email"}</CardTitle>
            <CardDescription>
              {step === "email"
                ? "We'll email you a one-time code valid for 5 minutes."
                : <>Sent to <span className="font-medium text-navy">{email}</span>. The code expires in 5 minutes.</>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "email" ? (
              <form onSubmit={sendCode} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <Button type="submit" disabled={loading} className="mt-2">
                  {loading ? "Sending…" : "Send code"}
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="code">One-time code</Label>
                  {/*
                    Supabase's email-OTP length is project-configurable (6 or 8
                    digits). We accept anything from 6 up to 10 numeric chars
                    and let verifyOtp tell us if it's wrong — avoids having to
                    keep this length in sync with the Supabase setting.
                  */}
                  <Input
                    ref={codeInputRef}
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="••••••••"
                    className="text-center text-2xl tracking-[0.35em] font-mono"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading || code.length < 6} className="mt-2">
                  {loading ? "Verifying…" : "Verify & sign in"}
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setCode(""); }}
                    className="text-muted hover:text-foreground"
                  >
                    ← Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={resend}
                    disabled={secondsLeft > 0 || loading}
                    className="text-bronze hover:text-bronze-dark disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code"}
                  </button>
                </div>
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

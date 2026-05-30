"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
    if (step === "code") setTimeout(() => codeInputRef.current?.focus(), 100);
  }, [step]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email) { toast.error("Enter your email"); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      toast.message("If this email is on the team, a code has been sent.");
    } else {
      toast.success("Code sent — check your email");
    }
    setStep("code");
    setSecondsLeft(60);
  }

  async function verifyCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length < 6) { toast.error("Enter the code"); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    router.refresh();
    router.push("/firm"); // middleware bounces by role
  }

  async function resend() {
    if (secondsLeft > 0) return;
    setCode("");
    await sendCode();
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface p-2 sm:p-4 lg:flex-row lg:gap-4">
      {/* Left — brand panel */}
      <aside className="relative hidden overflow-hidden rounded-3xl bg-navy text-white lg:flex lg:w-1/2 xl:w-[55%]">
        {/* Subtle dot constellation — nods to the brain-map without being literal */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(199,148,76,0.45) 1px, transparent 0)",
            backgroundSize: "36px 36px",
          }}
        />
        {/* Warm-bronze glow in the lower-right */}
        <div
          className="absolute -bottom-32 -right-32 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #C7944C 0%, transparent 70%)" }}
        />

        <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-7 w-auto brightness-0 invert" priority />
          </div>

          <div className="max-w-lg">
            <h1 className="font-serif text-5xl font-bold leading-[1.05] tracking-tight text-white xl:text-[64px]">
              See first.
              <br />
              Act sooner.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/70">
              The signal desk that surfaces what matters, ranked by significance — and routes it to the people who can act on it.
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-white/40">
            <span>© {new Date().getFullYear()} Samvidya</span>
            <span className="font-mono">samvidya.com</span>
          </div>
        </div>
      </aside>

      {/* Right — form panel */}
      <section className="flex flex-1 items-center justify-center rounded-3xl bg-white p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Brand mark on mobile (when left panel is hidden) */}
          <div className="mb-10 flex justify-center lg:hidden">
            <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-7 w-auto" priority />
          </div>

          <h2 className="font-serif text-4xl font-bold text-navy">
            {step === "email" ? "Sign in" : "Check your email"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {step === "email"
              ? "Enter your email and we'll send a one-time code."
              : (
                <>We sent a code to <span className="font-medium text-navy">{email}</span>. It expires in 5 minutes.</>
              )}
          </p>

          <div className="mt-8">
            {step === "email" ? (
              <form onSubmit={sendCode} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    placeholder="you@samvidya.com"
                    className="h-12 rounded-full border-border bg-white px-5 text-[15px]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  variant="bronze"
                  className="mt-2 h-12 rounded-full bg-gradient-to-r from-bronze to-[#E0613E] text-[15px] font-semibold shadow-md hover:opacity-95"
                >
                  {loading ? "Sending…" : (
                    <>
                      Send code
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">Code</Label>
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
                    className="h-14 rounded-full border-border bg-white text-center text-2xl tracking-[0.35em] font-mono"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || code.length < 6}
                  variant="bronze"
                  className="mt-2 h-12 rounded-full bg-gradient-to-r from-bronze to-[#E0613E] text-[15px] font-semibold shadow-md hover:opacity-95"
                >
                  {loading ? "Verifying…" : "Verify & sign in"}
                </Button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setCode(""); }}
                    className="text-muted hover:text-foreground"
                  >
                    ← Different email
                  </button>
                  <button
                    type="button"
                    onClick={resend}
                    disabled={secondsLeft > 0 || loading}
                    className="font-medium text-bronze hover:text-bronze-dark disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer row — volunteer link + © */}
          <div className="mt-12 flex items-center justify-between border-t border-border pt-5 text-[11px] text-muted">
            <a href="/v/login" className="text-bronze hover:text-bronze-dark">Field app →</a>
            <span>© {new Date().getFullYear()} Samvidya</span>
          </div>
        </div>
      </section>
    </main>
  );
}

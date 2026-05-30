"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-muted hover:border-bronze hover:bg-bronze-soft hover:text-bronze-dark"
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 11L13 8L10 5" />
        <path d="M13 8H6" />
        <path d="M9 13H4C3.45 13 3 12.55 3 12V4C3 3.45 3.45 3 4 3H9" />
      </svg>
      Sign out
    </button>
  );
}

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
      className="rounded border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
    >
      Sign out
    </button>
  );
}

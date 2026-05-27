"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function ActivityFilters({
  actions, users, initial,
}: {
  actions: string[];
  users: { id: string; full_name: string | null; email: string }[];
  initial: { user?: string; action?: string; role?: string; days?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    start(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Select label="Window" value={initial.days ?? "7"} onChange={(v) => setParam("days", v)} options={[
        { value: "1", label: "Last 24h" }, { value: "7", label: "Last 7d" },
        { value: "30", label: "Last 30d" }, { value: "90", label: "Last 90d" },
      ]} />
      <Select label="Role" value={initial.role ?? "all"} onChange={(v) => setParam("role", v)} options={[
        { value: "all", label: "All roles" },
        { value: "superadmin", label: "Superadmin" },
        { value: "firm_admin", label: "Admin" },
        { value: "firm_analyst", label: "Analyst" },
        { value: "firm_intern", label: "Intern" },
        { value: "party_viewer", label: "CMO" },
        { value: "volunteer", label: "Volunteer" },
      ]} />
      <Select label="Action" value={initial.action ?? "all"} onChange={(v) => setParam("action", v)} options={[
        { value: "all", label: "All actions" },
        ...actions.map((a) => ({ value: a, label: a.replace(/_/g, " ") })),
      ]} />
      <Select label="User" value={initial.user ?? "all"} onChange={(v) => setParam("user", v)} options={[
        { value: "all", label: "All users" },
        ...users.map((u) => ({ value: u.id, label: u.full_name ?? u.email })),
      ]} />
      {pending && <span className="text-xs text-muted">loading…</span>}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

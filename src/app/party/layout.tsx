import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { FeedbackButton } from "@/components/feedback-button";
import { requireSession, isMinisterScope, isCmoScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

// CMO nav — full state-wide view.
const NAV_CMO: NavItem[] = [
  { href: "/party",                label: "Dashboard",      icon: "dashboard" },
  { href: "/party/constituencies", label: "Constituencies", icon: "constituencies", section: "Survey" },
  { href: "/party/cabinet",        label: "Cabinet",        icon: "cabinet",        section: "Survey" },
  { href: "/party/threats",        label: "Threats",        icon: "threats",        section: "Survey" },
  { href: "/party/watch",          label: "My watchlist",   icon: "watchlist",      section: "Personal" },
  { href: "/party/decisions",      label: "Decisions",      icon: "decisions",      section: "Personal" },
  { href: "/party/brief",          label: "Brief",          icon: "brief",          section: "Reports" },
  { href: "/party/alerts",         label: "Alerts",         icon: "alerts",         section: "Reports" },
  // /party/brain reachable via the brain-icon shortcut at the top of the sidebar
];

// Minister nav — only what's about THEM.
const NAV_MINISTER: NavItem[] = [
  { href: "/party",           label: "My desk",    icon: "desk" },
  { href: "/party/threats",   label: "My threats", icon: "threats" },
  { href: "/party/decisions", label: "Decisions",  icon: "decisions" },
  { href: "/party/alerts",    label: "Alerts",     icon: "alerts" },
  // /party/brain reachable via the brain-icon shortcut at the top of the sidebar
];

export default async function PartyLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  if (ctx.role !== "party_viewer") redirect("/firm");

  const minister = isMinisterScope(ctx);
  const cmo = isCmoScope(ctx);
  const nav = minister ? NAV_MINISTER : NAV_CMO;

  // Audit every party page view. Fire-and-forget so it never adds latency.
  const path = headers().get("x-pathname") ?? "/party";
  auditLog({
    user_id: ctx.user_id,
    action: "party_view",
    entity_type: "page",
    entity_id: path,
    metadata: { scope: cmo ? "cmo" : "minister", scope_mla_id: minister ? ctx.scope.mla_id : null },
  }).catch(() => { /* swallow — audit must not break the page */ });

  const userLabel = minister
    ? `${ctx.full_name ?? ctx.email} · ${ctx.scope.mla_name}`
    : ctx.full_name ?? ctx.email;

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar scope="party" nav={nav} userName={userLabel} />
      <main className="min-w-0 flex-1">{children}</main>
      <FeedbackButton />
    </div>
  );
}

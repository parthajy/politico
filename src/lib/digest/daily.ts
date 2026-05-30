import { createAdminClient } from "@/lib/supabase/admin";
import { subHours, format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Daily "What changed?" digest.
//
// For each subscribed user we build a personalised payload — top deltas vs
// yesterday across the state PLUS activity on every entity they've pinned
// in their watchlist. Returns rendered HTML ready for Resend.
// ─────────────────────────────────────────────────────────────────────────────

export type DigestUserInput = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
};

export type WatchActivity = {
  kind: string;
  label: string;
  ref_id: string;
  signals_24h: number;
  peak_snt_24h: number;
  top_title: string | null;
};

export type DigestData = {
  date_label: string;
  signals_24h: number;
  signals_prior_24h: number;
  signals_delta: number;
  s1_alerts: { title: string; created_at: string }[];
  urgent_narratives: { label: string; summary: string }[];
  top_signals: { title: string; source: string; snt_score: number; sentiment: number }[];
  watchlist_activity: WatchActivity[];
  brief_summary: string | null;
  brief_date: string | null;
};

export async function buildDigestData(user: DigestUserInput): Promise<DigestData> {
  const admin = createAdminClient();
  const now = new Date();
  const since24h = subHours(now, 24).toISOString();
  const since48h = subHours(now, 48).toISOString();
  const date_label = format(now, "EEEE, d MMMM yyyy");

  const [
    { count: signals24 },
    { count: signals48 },
    { data: alerts },
    { data: urgentNarrs },
    { data: topSignalsRaw },
    { data: latestBrief },
    { data: watchItems },
  ] = await Promise.all([
    admin.from("events").select("id", { count: "exact", head: true }).gte("ingested_at", since24h),
    admin.from("events").select("id", { count: "exact", head: true }).gte("ingested_at", since48h).lt("ingested_at", since24h),
    admin.from("alerts").select("title, created_at").is("resolved_at", null).eq("severity", "s1").order("created_at", { ascending: false }).limit(5),
    admin.from("narratives").select("label, summary").eq("tier", "urgent").eq("status", "active").order("last_updated_at", { ascending: false }).limit(5),
    admin.from("classifications")
      .select("snt_score, sentiment, events!inner(title, source)")
      .gte("classified_at", since24h)
      .order("snt_score", { ascending: false, nullsFirst: false })
      .limit(5),
    admin.from("briefs").select("body_md, brief_date").not("published_at", "is", null).order("brief_date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("watch_items").select("*").eq("user_id", user.user_id),
  ]);

  const signals_24h = signals24 ?? 0;
  const signals_prior_24h = signals48 ?? 0;

  const top_signals = (topSignalsRaw ?? []).map((r) => {
    const ev = (r.events as unknown) as { title: string; source: string };
    return {
      title: ev.title,
      source: ev.source,
      snt_score: Number(r.snt_score ?? 0),
      sentiment: Number(r.sentiment ?? 0),
    };
  });

  // For each watched item, fetch 24h signals
  const watchlist_activity: WatchActivity[] = [];
  for (const w of (watchItems ?? []) as Array<{ kind: string; ref_id: string; label: string }>) {
    let query = admin
      .from("classifications")
      .select("snt_score, events!inner(title)")
      .gte("classified_at", since24h)
      .order("snt_score", { ascending: false, nullsFirst: false })
      .limit(5);
    if (w.kind === "minister") query = query.eq("mla_id", parseInt(w.ref_id, 10));
    else if (w.kind === "constituency") query = query.eq("constituency_id", parseInt(w.ref_id, 10));
    else if (w.kind === "district") query = query.eq("district_id", parseInt(w.ref_id, 10));
    else if (w.kind === "topic") query = query.contains("topic_tags", [w.ref_id]);
    else continue; // narrative — TODO

    const { data: rows } = await query;
    const list = rows ?? [];
    if (list.length === 0) continue;
    const peak = Math.max(...list.map((r) => Number(r.snt_score ?? 0)));
    const top = (list[0]?.events as unknown) as { title: string } | null;
    watchlist_activity.push({
      kind: w.kind,
      label: w.label,
      ref_id: w.ref_id,
      signals_24h: list.length,
      peak_snt_24h: peak,
      top_title: top?.title ?? null,
    });
  }

  // Use first 600 chars of latest brief as the executive summary
  const briefBody = latestBrief?.body_md ?? null;
  const brief_summary = briefBody
    ? briefBody.slice(0, 600).split("\n").slice(0, 6).join(" ").replace(/\s+/g, " ").trim()
    : null;

  return {
    date_label,
    signals_24h,
    signals_prior_24h,
    signals_delta: signals_24h - signals_prior_24h,
    s1_alerts: (alerts ?? []).map((a) => ({ title: a.title, created_at: a.created_at })),
    urgent_narratives: (urgentNarrs ?? []).map((n) => ({ label: n.label, summary: n.summary })),
    top_signals,
    watchlist_activity,
    brief_summary,
    brief_date: latestBrief?.brief_date ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render to HTML (inline-styled for email clients).
// ─────────────────────────────────────────────────────────────────────────────
export function renderDigestHtml(user: DigestUserInput, d: DigestData, siteUrl: string): string {
  const greeting = user.full_name ? `Good morning, ${user.full_name.split(/\s+/)[0]}` : "Good morning";
  const deltaTxt = d.signals_delta === 0 ? "same pace" : d.signals_delta > 0 ? `+${d.signals_delta} vs yesterday` : `${d.signals_delta} vs yesterday`;
  const deltaColor = d.signals_delta >= 0 ? "#15803D" : "#C04646";

  const watchHtml = d.watchlist_activity.length === 0
    ? `<p style="color:#7c7c7c;font-size:13px;font-style:italic">Nothing new on your watchlist in the last 24h.</p>`
    : d.watchlist_activity.map((w) => `
        <div style="border-left:3px solid #C7944C;padding:8px 12px;margin-bottom:8px;background:#FBF3E5">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#A6783B">${w.kind}</div>
          <div style="font-weight:600;color:#0F2942;font-family:Georgia,serif;font-size:15px">${escapeHtml(w.label)}</div>
          <div style="color:#525252;font-size:13px;margin-top:2px">${w.signals_24h} signal${w.signals_24h === 1 ? "" : "s"} · peak SNT ${w.peak_snt_24h.toFixed(2)}</div>
          ${w.top_title ? `<div style="color:#7c7c7c;font-size:12px;margin-top:4px">↳ ${escapeHtml(w.top_title)}</div>` : ""}
        </div>
      `).join("");

  const alertsHtml = d.s1_alerts.length === 0
    ? `<p style="color:#15803D;font-size:13px;margin:0">No active S1 alerts.</p>`
    : d.s1_alerts.map((a) => `<div style="border-left:3px solid #C04646;padding:6px 10px;margin-bottom:6px;background:#FCEDED;color:#0F2942;font-size:13px">${escapeHtml(a.title)}</div>`).join("");

  const urgentHtml = d.urgent_narratives.length === 0 ? "" : `
    <h3 style="font-family:Georgia,serif;color:#0F2942;font-size:18px;margin:24px 0 8px 0">🔴 Urgent narratives</h3>
    ${d.urgent_narratives.map((n) => `
      <div style="margin-bottom:10px">
        <div style="font-weight:600;color:#0F2942;font-size:14px">${escapeHtml(n.label)}</div>
        <div style="color:#525252;font-size:13px;margin-top:2px">${escapeHtml(n.summary)}</div>
      </div>`).join("")}
  `;

  const topSignalsHtml = d.top_signals.length === 0 ? "" : `
    <h3 style="font-family:Georgia,serif;color:#0F2942;font-size:18px;margin:24px 0 8px 0">Top signals · 24h</h3>
    ${d.top_signals.map((s) => `
      <div style="border-bottom:1px solid #ECE7DD;padding:6px 0;font-size:13px;color:#1A1A1A">
        <span style="display:inline-block;background:#FBF3E5;color:#A6783B;font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;margin-right:6px">SNT ${s.snt_score.toFixed(2)}</span>
        ${escapeHtml(s.title)}
        <span style="color:#7c7c7c;font-size:11px;margin-left:6px">${escapeHtml(s.source)}</span>
      </div>`).join("")}
  `;

  const briefHtml = d.brief_summary ? `
    <h3 style="font-family:Georgia,serif;color:#0F2942;font-size:18px;margin:24px 0 8px 0">From the morning brief</h3>
    <p style="color:#1A1A1A;font-size:13px;line-height:1.6;font-family:Georgia,serif">${escapeHtml(d.brief_summary)}…</p>
    <a href="${siteUrl}/${user.role === "party_viewer" ? "party" : "firm"}/briefs" style="color:#A6783B;font-size:12px">Read the full brief →</a>
  ` : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A">
  <div style="max-width:600px;margin:0 auto;padding:24px;background:#FFFFFF">
    <div style="border-bottom:1px solid #ECE7DD;padding-bottom:16px;margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#C7944C;font-weight:600">Samvidya · Daily Digest</div>
      <h1 style="font-family:Georgia,serif;color:#0F2942;font-size:24px;margin:6px 0 0 0">${greeting}</h1>
      <div style="color:#7c7c7c;font-size:13px;margin-top:4px">${d.date_label}</div>
    </div>

    <!-- Hero stat -->
    <div style="background:#FAFAF7;border-radius:12px;padding:16px 18px;margin-bottom:20px">
      <div style="font-size:11px;color:#7c7c7c;text-transform:uppercase;letter-spacing:0.12em">Signals · last 24h</div>
      <div style="font-family:Georgia,serif;font-weight:700;font-size:36px;color:#0F2942;margin-top:4px">${d.signals_24h.toLocaleString()}</div>
      <div style="color:${deltaColor};font-size:13px;font-weight:500;margin-top:2px">${deltaTxt}</div>
    </div>

    <!-- S1 alerts -->
    <h3 style="font-family:Georgia,serif;color:#0F2942;font-size:18px;margin:0 0 8px 0">Active S1 alerts</h3>
    ${alertsHtml}

    ${urgentHtml}

    <!-- Watchlist -->
    <h3 style="font-family:Georgia,serif;color:#0F2942;font-size:18px;margin:24px 0 8px 0">📌 Your watchlist · 24h activity</h3>
    ${watchHtml}

    ${topSignalsHtml}

    ${briefHtml}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #ECE7DD;font-size:11px;color:#7c7c7c;text-align:center">
      <a href="${siteUrl}/${user.role === "party_viewer" ? "party" : "firm"}" style="color:#A6783B">Open Samvidya</a>
      &nbsp; · &nbsp;
      <a href="${siteUrl}/${user.role === "party_viewer" ? "party" : "firm"}/watch" style="color:#A6783B">Manage watchlist + unsubscribe</a>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

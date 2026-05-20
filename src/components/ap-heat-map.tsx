"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import geo from "@/lib/map/ap-districts.json";
import { sentimentColor } from "@/lib/format";

type DistrictDatum = {
  id: number;
  name: string;
  net_sentiment: number | null;
  signals_30d: number;
  risk_band?: "low" | "medium" | "high" | "critical" | null;
};

type GeoFeature = {
  type: "Feature";
  properties: { district: string; dt_code: number; st_nm: string };
  geometry: { type: string; coordinates: unknown };
};

type Metric = "sentiment" | "volume" | "threat";

const NAME_ALIASES: Record<string, string> = {
  "Dibang Valley": "Dibang Valley",
  "Lower Dibang Valley": "Lower Dibang Valley",
  "Kurung Kumey": "Kurung Kumey",
  "Kra Daadi": "Kra Daadi",
  "Lepa Rada": "Lepa-Rada",
  "Pakke Kessang": "Pakke-Kessang",
  "Shi Yomi": "Shi-Yomi",
  "Tirap": "Tirap",
  "East Kameng": "East Kameng",
  "West Kameng": "West Kameng",
  "Lower Subansiri": "Lower Subansiri",
  "Upper Subansiri": "Upper Subansiri",
  "Lower Siang": "Lower Siang",
  "Upper Siang": "Upper Siang",
  "West Siang": "West Siang",
  "East Siang": "East Siang",
};

const NO_DATA = "#E8E4DC";

function volumeColor(v: number, max: number): string {
  if (max <= 0 || v <= 0) return NO_DATA;
  const t = Math.min(1, v / max);
  // sand → navy ramp
  if (t < 0.2) return "#E8E4DC";
  if (t < 0.4) return "#C9BFA8";
  if (t < 0.6) return "#9AA9B5";
  if (t < 0.8) return "#4C6478";
  return "#0F2942";
}

function threatColor(band: string | null | undefined): string {
  if (band === "critical" || band === "high") return "var(--severity-1)";
  if (band === "medium") return "var(--bronze)";
  if (band === "low") return "#5BA976";
  return NO_DATA;
}

export function ApHeatMap({ data, hrefBase = "/party/district" }: { data: DistrictDatum[]; hrefBase?: string }) {
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>("sentiment");
  const [hover, setHover] = useState<{ name: string; sentiment: number | null; signals: number; threat: string | null } | null>(null);

  const dataByName = useMemo(() => {
    const m = new Map<string, DistrictDatum>();
    for (const d of data) m.set(d.name, d);
    return m;
  }, [data]);

  const merged = useMemo(() => {
    const m = new Map(dataByName);
    const pp = m.get("Papum Pare");
    const icr = m.get("Itanagar Capital Complex");
    if (pp && icr) {
      m.set("Papum Pare", {
        ...pp,
        signals_30d: pp.signals_30d + icr.signals_30d,
        net_sentiment:
          pp.net_sentiment != null && icr.net_sentiment != null
            ? (pp.net_sentiment + icr.net_sentiment) / 2
            : (pp.net_sentiment ?? icr.net_sentiment),
      });
    }
    return m;
  }, [dataByName]);

  const maxVolume = useMemo(() => Math.max(1, ...Array.from(merged.values()).map((d) => d.signals_30d)), [merged]);

  function fillFor(d: DistrictDatum | undefined): string {
    if (!d) return NO_DATA;
    if (metric === "sentiment") return sentimentColor(d.net_sentiment);
    if (metric === "volume") return volumeColor(d.signals_30d, maxVolume);
    return threatColor(d.risk_band);
  }

  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-1 rounded border border-border bg-white p-1 text-xs">
        {([
          { v: "sentiment" as const, label: "Sentiment" },
          { v: "volume" as const, label: "Signal volume" },
          { v: "threat" as const, label: "Risk band" },
        ]).map((b) => (
          <button
            key={b.v}
            onClick={() => setMetric(b.v)}
            className={`rounded px-3 py-1 transition ${metric === b.v ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 5500, center: [94.5, 28.0] }}
        width={800}
        height={420}
        className="w-full"
      >
        <Geographies geography={geo as unknown as { type: string; features: GeoFeature[] }}>
          {({ geographies }) =>
            geographies.map((g) => {
              const rawName = g.properties.district as string;
              const dbName = NAME_ALIASES[rawName] ?? rawName;
              const d = merged.get(dbName);
              return (
                <Geography
                  key={g.rsmKey}
                  geography={g}
                  fill={fillFor(d)}
                  stroke="#FFFFFF"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: "none", cursor: d ? "pointer" : "default", opacity: d ? 1 : 0.5, transition: "fill 300ms ease" },
                    hover: { outline: "none", filter: "brightness(1.1)" },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={() => setHover({ name: dbName, sentiment: d?.net_sentiment ?? null, signals: d?.signals_30d ?? 0, threat: d?.risk_band ?? null })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => { if (d) router.push(`${hrefBase}/${d.id}`); }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {hover && (
        <div className="pointer-events-none absolute right-3 top-14 rounded border border-border bg-white px-3 py-2 text-xs shadow-sm">
          <div className="font-medium text-navy">{hover.name}</div>
          <div className="mt-0.5 text-muted">
            sentiment {hover.sentiment != null ? hover.sentiment.toFixed(2) : "—"} · {hover.signals} signals 30d
            {hover.threat && <> · risk {hover.threat}</>}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        {metric === "sentiment" && (
          <>
            <span>Net sentiment</span>
            <Legend color="var(--severity-1)" label="hostile" />
            <Legend color="var(--bronze)" label="negative" />
            <Legend color="var(--muted)" label="neutral" />
            <Legend color="#5BA976" label="positive" />
            <Legend color="var(--positive)" label="strong +" />
          </>
        )}
        {metric === "volume" && (
          <>
            <span>Signal volume · 30d</span>
            <Legend color="#E8E4DC" label="low" />
            <Legend color="#9AA9B5" label="medium" />
            <Legend color="#0F2942" label="high" />
          </>
        )}
        {metric === "threat" && (
          <>
            <span>District risk</span>
            <Legend color="#5BA976" label="low" />
            <Legend color="var(--bronze)" label="medium" />
            <Legend color="var(--severity-1)" label="high / critical" />
          </>
        )}
        <span className="ml-2">No data: grey</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-3 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}

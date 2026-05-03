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
};

type GeoFeature = {
  type: "Feature";
  properties: { district: string; dt_code: number; st_nm: string };
  geometry: { type: string; coordinates: unknown };
};

// Some district names in the GeoJSON differ slightly from our DB. Map them.
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
  // The GeoJSON's "Papum Pare" includes the area we treat as Itanagar Capital Complex.
  // For display purposes we'll merge ICR signal counts into Papum Pare on the map.
};

export function ApHeatMap({ data, hrefBase = "/party/district" }: { data: DistrictDatum[]; hrefBase?: string }) {
  const router = useRouter();
  const [hover, setHover] = useState<{ name: string; sentiment: number | null; signals: number } | null>(null);

  const dataByName = useMemo(() => {
    const m = new Map<string, DistrictDatum>();
    for (const d of data) m.set(d.name, d);
    return m;
  }, [data]);

  // Merge Itanagar Capital Complex into Papum Pare for the map render
  const merged = useMemo(() => {
    const m = new Map(dataByName);
    const pp = m.get("Papum Pare");
    const icr = m.get("Itanagar Capital Complex");
    if (pp && icr) {
      m.set("Papum Pare", {
        ...pp,
        signals_30d: pp.signals_30d + icr.signals_30d,
        // Combined sentiment: weighted average (or simple avg if both have data)
        net_sentiment:
          pp.net_sentiment != null && icr.net_sentiment != null
            ? (pp.net_sentiment + icr.net_sentiment) / 2
            : (pp.net_sentiment ?? icr.net_sentiment),
      });
    }
    return m;
  }, [dataByName]);

  return (
    <div className="relative">
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
              const fill = d ? sentimentColor(d.net_sentiment) : "#E8E4DC"; // sand-deep for no-data
              return (
                <Geography
                  key={g.rsmKey}
                  geography={g}
                  fill={fill}
                  stroke="#FFFFFF"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: "none", cursor: d ? "pointer" : "default", opacity: d ? 1 : 0.5 },
                    hover: { outline: "none", filter: "brightness(1.1)" },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={() => setHover({ name: dbName, sentiment: d?.net_sentiment ?? null, signals: d?.signals_30d ?? 0 })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    if (!d) return;
                    router.push(`${hrefBase}/${d.id}`);
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {hover && (
        <div className="pointer-events-none absolute right-3 top-3 rounded border border-border bg-white px-3 py-2 text-xs shadow-sm">
          <div className="font-medium text-navy">{hover.name}</div>
          <div className="mt-0.5 text-muted">
            sentiment: {hover.sentiment != null ? hover.sentiment.toFixed(2) : "—"} · signals 30d: {hover.signals}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
        <span>Sentiment</span>
        <Legend color="var(--severity-1)" label="< -0.5" />
        <Legend color="var(--bronze)" label="< -0.15" />
        <Legend color="var(--muted)" label="≈ 0" />
        <Legend color="#5BA976" label="> 0.15" />
        <Legend color="var(--positive)" label="> 0.5" />
        <span className="ml-2">No data: shaded grey</span>
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

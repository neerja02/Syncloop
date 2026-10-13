"use client";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  t: string;
  v: number;
  v2?: number | null;
}

const fmtDate = (t: string) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Accessible trend chart: the line is supplemented by a visually-hidden data table for screen readers,
 * and target bands are labelled, so meaning never depends on colour alone.
 */
export function TrendChart({
  points,
  unit,
  label,
  height = 200,
  band,
  secondaryLabel,
  compact,
}: {
  points: TrendPoint[];
  unit: string;
  label: string;
  height?: number;
  band?: { from: number; to: number; label: string } | null;
  secondaryLabel?: string;
  compact?: boolean;
}) {
  if (!points.length) return <p className="py-6 text-center text-sm text-muted">No readings yet.</p>;
  const data = points.map((p) => ({ ...p, label: fmtDate(p.t) }));
  const hasSecondary = points.some((p) => p.v2 != null);
  return (
    <figure className="w-full">
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: compact ? -24 : -8 }}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
            {band && <ReferenceArea y1={band.from} y2={band.to} fill="#59B6E6" fillOpacity={0.08} stroke="#59B6E6" strokeOpacity={0.25} strokeDasharray="4 4" label={{ value: band.label, position: "insideTopRight", fontSize: 10, fill: "#28328C" }} />}
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13 }}
              formatter={(value, name) => [`${value} ${unit}`, name === "v2" ? secondaryLabel ?? "Secondary" : label]}
              labelFormatter={(l) => String(l)}
            />
            <Line type="monotone" dataKey="v" stroke="#3D83DF" strokeWidth={2.2} dot={{ r: 2.5, fill: "#3D83DF" }} activeDot={{ r: 5 }} isAnimationActive={false} />
            {hasSecondary && <Line type="monotone" dataKey="v2" stroke="#28328C" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5, fill: "#28328C" }} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hasSecondary && !compact && (
        <figcaption className="mt-2 flex gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-primary" aria-hidden /> {label}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-accent" aria-hidden /> {secondaryLabel}
          </span>
        </figcaption>
      )}
      <table className="sr-only">
        <caption>
          {label} readings in {unit}
        </caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>{label}</th>
            {hasSecondary && <th>{secondaryLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{new Date(d.t).toLocaleString("en-GB")}</td>
              <td>{d.v}</td>
              {hasSecondary && <td>{d.v2 ?? ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

import type { TrendPoint } from "@/lib/analytics/trends";

interface TrendBarChartProps {
  title: string;
  points: TrendPoint[];
  color: string;
}

/** A deliberately simple inline-SVG bar chart — the project has no
 * charting library and Phase 11 explicitly says not to add a heavy one
 * just for this (section 22). Renders an honest empty state when every
 * bucket is zero rather than a chart implying data that isn't there. */
export function TrendBarChart({ title, points, color }: TrendBarChartProps) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const hasAnyData = points.some((p) => p.value > 0);
  const width = 640;
  const height = 140;
  const barGap = 4;
  const barWidth = points.length > 0 ? Math.max(4, width / points.length - barGap) : 0;

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      {!hasAnyData ? (
        <div className="flex h-[140px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No data yet for this period.
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[140px] w-full" role="img" aria-label={title}>
          {points.map((point, index) => {
            const barHeight = Math.max(2, (point.value / max) * (height - 20));
            const x = index * (barWidth + barGap);
            const y = height - barHeight - 16;
            return (
              <g key={point.bucketStart}>
                <rect x={x} y={y} width={barWidth} height={barHeight} rx={2} fill={color} opacity={0.85}>
                  <title>{`${point.bucketStart}: ${point.value}`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

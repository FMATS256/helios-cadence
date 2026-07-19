import { ReactNode, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
} from "recharts";
import { cn } from "@/lib/utils";

/** IMT brand palette (values from src/styles.css). */
export const IMT_COLORS = {
  solar: "oklch(0.58 0.14 250)",
  solarGlow: "oklch(0.68 0.13 245)",
  navy: "oklch(0.22 0.09 265)",
  success: "oklch(0.65 0.16 150)",
  warning: "oklch(0.75 0.16 75)",
  info: "oklch(0.6 0.16 240)",
  danger: "oklch(0.6 0.22 27)",
};

export const IMT_SERIES = [
  IMT_COLORS.solar,
  IMT_COLORS.success,
  IMT_COLORS.warning,
  IMT_COLORS.info,
  IMT_COLORS.solarGlow,
  IMT_COLORS.navy,
];

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold mb-1 text-foreground">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatter ? formatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Modern gradient area chart with grid + tooltip. */
export function GradientAreaChart({
  data,
  dataKey = "value",
  xKey = "label",
  height = 220,
  color = IMT_COLORS.solar,
  colorEnd = IMT_COLORS.solarGlow,
  formatter,
}: {
  data: any[];
  dataKey?: string;
  xKey?: string;
  height?: number;
  color?: string;
  colorEnd?: string;
  formatter?: (v: number) => string;
}) {
  const gradId = useMemo(() => `grad-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorEnd} stopOpacity={0.55} />
              <stop offset="60%" stopColor={color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gradId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor={colorEnd} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(0.92 0.01 255)" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke="oklch(0.5 0.03 260)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="oklch(0.5 0.03 260)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatter as any}
            width={48}
          />
          <Tooltip content={<ChartTooltip formatter={formatter} />} cursor={{ stroke: color, strokeDasharray: "3 3", strokeOpacity: 0.4 }} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={`url(#${gradId}-line)`}
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={{ r: 3, fill: color, strokeWidth: 2, stroke: "var(--card)" }}
            activeDot={{ r: 5, fill: colorEnd, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Compact sparkline for KPI cards. */
export function Sparkline({
  data,
  color = IMT_COLORS.solar,
  height = 36,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const chartData = data.map((v, i) => ({ i, v }));
  const gradId = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut chart with center label. */
export function DonutChart({
  data,
  height = 220,
  centerLabel,
  centerValue,
  colors = IMT_SERIES,
  formatter,
}: {
  data: { name: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: ReactNode;
  colors?: string[];
  formatter?: (v: number) => string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            dataKey="value"
            stroke="var(--card)"
            strokeWidth={3}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatter={formatter} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          {centerLabel ?? "Total"}
        </p>
        <p className="font-display text-2xl font-bold tabular-nums mt-0.5">
          {centerValue ?? total}
        </p>
      </div>
    </div>
  );
}

/** Radial gauge (percentage-based). */
export function RadialGauge({
  value,
  max = 100,
  label,
  color = IMT_COLORS.solar,
  height = 180,
  suffix = "%",
}: {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  height?: number;
  suffix?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const data = [{ name: "v", value: pct, fill: color }];
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart data={data} innerRadius="70%" outerRadius="100%" startAngle={210} endAngle={-30}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "oklch(0.92 0.01 255)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="font-display text-3xl font-bold tabular-nums">{pct}{suffix}</p>
        {label && <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">{label}</p>}
      </div>
    </div>
  );
}

/** Legend row for donut/pie charts. */
export function ChartLegend({
  items,
  colors = IMT_SERIES,
  className,
}: {
  items: { name: string; value: number | string; hint?: string }[];
  colors?: string[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((it, i) => (
        <div key={it.name} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} />
          <span className="capitalize flex-1 truncate">{it.name}</span>
          <span className="tabular-nums font-semibold">{it.value}</span>
          {it.hint && <span className="text-xs text-muted-foreground tabular-nums">{it.hint}</span>}
        </div>
      ))}
    </div>
  );
}

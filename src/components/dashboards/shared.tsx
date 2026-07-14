import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline, IMT_COLORS } from "./charts";

/** Futuristic gradient hero panel with animated glow. */
export function HeroPanel({
  eyebrow,
  title,
  subtitle,
  actions,
  accent = "solar",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  accent?: "solar" | "success" | "info" | "warning";
}) {
  const accentGrad =
    accent === "success"
      ? "radial-gradient(circle at 30% 20%, oklch(0.65 0.16 150 / 0.55), transparent 60%)"
      : accent === "info"
      ? "radial-gradient(circle at 30% 20%, oklch(0.6 0.16 240 / 0.55), transparent 60%)"
      : accent === "warning"
      ? "radial-gradient(circle at 30% 20%, oklch(0.75 0.16 75 / 0.55), transparent 60%)"
      : "var(--gradient-solar)";
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-8 text-navy-foreground"
      style={{ background: "var(--gradient-navy)" }}
    >
      <div
        className="absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-40 blur-3xl animate-pulse"
        style={{ background: accentGrad }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          {eyebrow && (
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-3">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl md:text-4xl font-bold">{title}</h1>
          {subtitle && (
            <p className="text-navy-foreground/70 mt-2 max-w-2xl">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "info",
  hint,
  to,
  spark,
  delta,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "success" | "warning" | "info" | "danger" | "solar";
  hint?: string;
  to?: string;
  spark?: number[];
  delta?: number;
}) {
  const toneMap: Record<string, string> = {
    solar: "bg-solar/15 text-solar",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
    danger: "bg-destructive/15 text-destructive",
  };
  const sparkColor: Record<string, string> = {
    solar: IMT_COLORS.solar,
    info: IMT_COLORS.info,
    success: IMT_COLORS.success,
    warning: IMT_COLORS.warning,
    danger: IMT_COLORS.danger,
  };
  const inner = (
    <Card className="group relative overflow-hidden border-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
      <div
        className="absolute inset-x-0 -top-px h-px opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "var(--gradient-solar)" }}
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-[2px]">
              {label}
            </p>
            <p className="font-display text-3xl font-bold text-foreground mt-2 tabular-nums">
              {value}
            </p>
          </div>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", toneMap[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {spark && spark.length > 1 && (
          <div className="-mx-1 mt-2">
            <Sparkline data={spark} color={sparkColor[tone]} height={32} />
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
          {typeof delta === "number" && (
            <span
              className={cn(
                "text-[11px] font-semibold tabular-nums rounded-full px-1.5 py-0.5",
                delta >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
              )}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to as any}>{inner}</Link> : inner;
}

export function QuickAction({
  icon: Icon,
  label,
  to,
  tone = "solar",
}: {
  icon: LucideIcon;
  label: string;
  to: string;
  tone?: "solar" | "info" | "success" | "warning";
}) {
  const toneMap: Record<string, string> = {
    solar: "from-solar/20 to-solar/5 text-solar",
    info: "from-info/20 to-info/5 text-info",
    success: "from-success/20 to-success/5 text-success",
    warning: "from-warning/30 to-warning/5 text-[oklch(0.45_0.13_75)]",
  };
  return (
    <Link
      to={to as any}
      className={cn(
        "group relative flex flex-col items-start gap-3 rounded-xl border border-border bg-gradient-to-br p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]",
        toneMap[tone],
      )}
    >
      <div className="h-10 w-10 rounded-lg bg-card flex items-center justify-center shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <span className="absolute right-3 top-3 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        →
      </span>
    </Link>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border", className)}>
      <div className="flex flex-row items-center justify-between px-6 pt-6">
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <CardContent className="p-6 pt-4">{children}</CardContent>
    </Card>
  );
}

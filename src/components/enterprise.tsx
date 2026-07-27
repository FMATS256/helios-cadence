/**
 * IMT Enterprise Design System
 * ===============================
 * Reusable primitives extracted from the Customer 360 page.
 * Every module across the IMT Account Manager Platform must consume these
 * components instead of inventing local variants, so the visual language,
 * spacing, colors, badges, and action bars stay consistent everywhere.
 *
 * Do not add page-specific logic in here. If a page needs bespoke rendering,
 * pass a `render*` prop or compose the primitives directly.
 */
import { ReactNode, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, RefreshCw, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * PageShell / SectionHeader
 * -------------------------------------------------------------------------*/

/** Standard page wrapper — same padding/rhythm as Customer 360. */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-6 md:p-8 space-y-6", className)}>{children}</div>;
}

/** Page header with eyebrow / title / description / actions. */
export function SectionHeader({
  eyebrow, title, description, actions, className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex flex-col md:flex-row md:items-end md:justify-between gap-4 pb-6 border-b border-border",
      className,
    )}>
      <div>
        {eyebrow && (
          <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground tracking-tight">
          {title}
        </h1>
        {description && <p className="text-muted-foreground mt-2 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * StatChip / KpiRow — colored ISP-style hero chips + neutral KPI tiles
 * -------------------------------------------------------------------------*/

export type StatChipDef = {
  label: string;
  value: string | number;
  /** Any CSS color — usually a hex from the IMT operations palette. */
  color: string;
  text?: string;
  hint?: string;
};

export function StatChip({ label, value, color, text = "#ffffff", hint }: StatChipDef) {
  return (
    <div
      className="p-4 border border-border flex flex-col items-center justify-center text-center"
      style={{ backgroundColor: color, color: text }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="font-display font-bold text-xl mt-1 tabular-nums">{String(value)}</p>
      {hint && <p className="text-[10px] opacity-70 mt-0.5">{hint}</p>}
    </div>
  );
}

/** A row of colored StatChips — automatically hidden when empty. */
export function StatChipRow({ chips, cols = 3 }: { chips: StatChipDef[]; cols?: 2 | 3 | 4 | 5 | 6 }) {
  if (!chips.length) return null;
  const grid =
    cols === 2 ? "grid-cols-2" :
    cols === 4 ? "grid-cols-2 md:grid-cols-4" :
    cols === 5 ? "grid-cols-2 md:grid-cols-5" :
    cols === 6 ? "grid-cols-3 md:grid-cols-6" :
    "grid-cols-3";
  return <div className={cn("grid gap-2", grid)}>{chips.map((c, i) => <StatChip key={i} {...c} />)}</div>;

}

export type KpiTone = "info" | "success" | "warning" | "danger" | "solar" | "neutral";

const KPI_TONE: Record<KpiTone, string> = {
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
  danger: "bg-destructive/15 text-destructive",
  solar: "bg-solar/15 text-solar",
  neutral: "bg-muted text-muted-foreground",
};

export type KpiTileDef = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  hint?: string;
};

export function KpiTile({ label, value, icon: Icon, tone = "info", hint }: KpiTileDef) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
            <p className="font-display text-2xl font-bold mt-2 tabular-nums">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1 truncate">{hint}</p>}
          </div>
          {Icon && (
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", KPI_TONE[tone])}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Standard KPI row — 2 cols on mobile, N on desktop. */
export function KpiRow({ items, cols = 5 }: { items: KpiTileDef[]; cols?: 3 | 4 | 5 | 6 }) {
  if (!items.length) return null;
  const grid =
    cols === 3 ? "sm:grid-cols-3" :
    cols === 4 ? "sm:grid-cols-4" :
    cols === 6 ? "sm:grid-cols-6" :
    "sm:grid-cols-5";
  return <div className={cn("grid grid-cols-2 gap-2", grid)}>{items.map((k, i) => <KpiTile key={i} {...k} />)}</div>;
}

/* ---------------------------------------------------------------------------
 * SummaryCard — big single value on a tinted background
 * -------------------------------------------------------------------------*/

export function SummaryCard({
  label, value, tone, hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "solar" | "warning" | "danger" | "success" | "info";
  hint?: string;
}) {
  const toneClass =
    tone === "solar" ? "border-solar/40 bg-solar/5" :
    tone === "warning" ? "border-amber-500/40 bg-amber-500/5" :
    tone === "danger" ? "border-destructive/40 bg-destructive/5" :
    tone === "success" ? "border-success/40 bg-success/5" :
    tone === "info" ? "border-info/40 bg-info/5" : "";
  return (
    <Card className={toneClass}>
      <CardContent className="p-5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
        <div className="mt-2 text-2xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * InfoCard / DetailCard — Quick Information style key/value grid
 * -------------------------------------------------------------------------*/

export type InfoRowDef = { label: string; value: ReactNode; sub?: string | null; link?: boolean };

export function InfoRow({ label, value, sub, link }: InfoRowDef) {
  const empty = value == null || value === "" || value === "—";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border pb-2">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <div className="text-right min-w-0">
        <p className={cn("text-sm font-medium truncate", link && "text-solar")}>
          {empty ? "—" : value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

export function InfoCard({
  title, rows, action, cols = 2, className,
}: {
  title: string;
  rows: InfoRowDef[];
  action?: ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}) {
  const visible = rows.filter((r) => r.value != null && r.value !== "" && r.value !== "—");
  if (!visible.length) return null;
  const grid = cols === 1 ? "grid-cols-1" : cols === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2";
  return (
    <Card className={className}>
      <div className="flex flex-row items-center justify-between px-6 py-3">
        <h3 className="text-sm font-display uppercase tracking-wider font-semibold">{title}</h3>
        {action}
      </div>
      <CardContent className={cn("grid gap-x-6 gap-y-2 pt-0", grid)}>
        {visible.map((r, i) => <InfoRow key={i} {...r} />)}
      </CardContent>
    </Card>
  );
}

/** Same visual as InfoCard but for embedding arbitrary children (charts, forms). */
export function DetailCard({
  title, action, children, className, padded = true,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <Card className={className}>
      <div className="flex flex-row items-center justify-between px-6 py-3 border-b border-border">
        <h3 className="text-sm font-display uppercase tracking-wider font-semibold">{title}</h3>
        {action}
      </div>
      <CardContent className={padded ? "p-6" : "p-0"}>{children}</CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * ActionBar — the colored button row from Customer 360
 * -------------------------------------------------------------------------*/

export type ActionTone = "indigo" | "amber" | "emerald" | "sky" | "rose" | "slate";

const ACTION_TONE: Record<ActionTone, string> = {
  indigo: "bg-[oklch(0.55_0.18_265)] hover:bg-[oklch(0.5_0.18_265)] text-white",
  amber: "bg-[oklch(0.75_0.16_75)] hover:bg-[oklch(0.7_0.16_75)] text-[oklch(0.25_0.08_75)]",
  emerald: "bg-[oklch(0.6_0.15_150)] hover:bg-[oklch(0.55_0.15_150)] text-white",
  sky: "bg-[oklch(0.6_0.14_240)] hover:bg-[oklch(0.55_0.14_240)] text-white",
  rose: "bg-[oklch(0.6_0.2_20)] hover:bg-[oklch(0.55_0.2_20)] text-white",
  slate: "bg-[oklch(0.4_0.03_265)] hover:bg-[oklch(0.35_0.03_265)] text-white",
};

export type ActionDef = {
  tone: ActionTone;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Hide the action entirely — used by the Capability Engine style guards. */
  hidden?: boolean;
};

export function ActionBtn({ tone, icon: Icon, label, onClick, disabled }: ActionDef) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed",
        ACTION_TONE[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/**
 * Full ActionBar — renders visible actions and folds anything beyond `visibleCount`
 * (plus any explicitly `overflow`-flagged actions) into a "More Actions" dropdown.
 */
export function ActionBar({
  actions, overflow, visibleCount = 5, className,
}: {
  actions: ActionDef[];
  overflow?: ReactNode;
  visibleCount?: number;
  className?: string;
}) {
  const visible = actions.filter((a) => !a.hidden).slice(0, visibleCount);
  if (!visible.length && !overflow) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visible.map((a, i) => <ActionBtn key={i} {...a} />)}
      {overflow && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm transition",
              ACTION_TONE.slate,
            )}>
              <MoreHorizontal className="h-3.5 w-3.5" />
              Other Actions
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{overflow}</DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * StatusBadge — canonical pill for status/lifecycle across every module
 * -------------------------------------------------------------------------*/

export type StatusTone = "success" | "warning" | "info" | "danger" | "solar" | "neutral";

const STATUS_TONE: Record<StatusTone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
  info: "bg-info/15 text-info",
  danger: "bg-destructive/15 text-destructive",
  solar: "bg-solar/15 text-[oklch(0.45_0.16_50)]",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusBadge({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold capitalize",
      STATUS_TONE[tone],
    )}>
      {children}
    </span>
  );
}

/** Map a raw status/lifecycle string to a canonical tone. */
export function toneForStatus(status?: string | null): StatusTone {
  const s = String(status || "").toLowerCase();
  if (["paid", "active", "received", "matched", "up", "running", "on", "accepted", "resolved", "closed"].includes(s)) return "success";
  if (["overdue", "failed", "down", "critical", "rejected", "cancelled", "terminated", "void"].includes(s)) return "danger";
  if (["pending", "partial", "warning", "sent", "draft", "processing", "expired"].includes(s)) return "warning";
  if (["info", "provisioning", "scheduled", "unreconciled", "in_progress"].includes(s)) return "info";
  return "neutral";
}

/* ---------------------------------------------------------------------------
 * DataGrid — canonical table used everywhere (empty state + loading built in)
 * -------------------------------------------------------------------------*/

export type ColumnDef<T> = {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
};

export function DataGrid<T extends { id?: string | number }>({
  rows, columns, loading, empty, onRowClick, keyOf, className,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  keyOf?: (row: T, i: number) => string | number;
  className?: string;
}) {
  if (loading) return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!rows.length) return <div className="p-10">{empty ?? <EmptyState title="No records" description="Nothing to display here." />}</div>;
  return (
    <div className={cn("w-full", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => (
              <TableHead key={i} className={cn(c.className, c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, ri) => (
            <TableRow
              key={keyOf ? keyOf(r, ri) : (r.id ?? ri)}
              className={onRowClick ? "cursor-pointer hover:bg-muted/40" : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c, ci) => (
                <TableCell key={ci} className={cn(c.className, c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                  {c.cell(r)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * EmptyState
 * -------------------------------------------------------------------------*/

export function EmptyState({
  title, description, icon: Icon = Inbox, action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10">
      <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="mt-3 font-semibold">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * TimelineFeed — audit / activity feed
 * -------------------------------------------------------------------------*/

export type TimelineEntry = {
  id: string | number;
  title: ReactNode;
  description?: ReactNode;
  at: string | Date;
  tone?: StatusTone;
  badge?: string;
  href?: string;
};

export function TimelineFeed({
  entries, empty,
}: {
  entries: TimelineEntry[];
  empty?: ReactNode;
}) {
  const items = useMemo(() => entries.slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [entries]);
  if (!items.length) return <>{empty ?? <EmptyState title="No activity yet" description="Events will appear here as they happen." />}</>;
  return (
    <div className="divide-y">
      {items.map((e) => {
        const inner = (
          <div className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {e.badge && <StatusBadge tone={e.tone ?? "info"}>{e.badge}</StatusBadge>}
                <p className="font-semibold truncate">{e.title}</p>
              </div>
              {e.description && <p className="text-sm text-muted-foreground mt-1">{e.description}</p>}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(e.at).toLocaleString()}
            </span>
          </div>
        );
        return e.href ? (
          <Link key={e.id} to={e.href as any} className="block hover:bg-muted/40">{inner}</Link>
        ) : (
          <div key={e.id}>{inner}</div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * RefreshButton — small helper used in headers
 * -------------------------------------------------------------------------*/

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={loading}>
      <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
      Refresh
    </Button>
  );
}

/* ---------------------------------------------------------------------------
 * Formatting helpers — used across every finance/operations page
 * -------------------------------------------------------------------------*/

export function money(n: number | string | null | undefined, ccy = "USD"): string {
  const v = Number(n || 0);
  return `${ccy} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(d?: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

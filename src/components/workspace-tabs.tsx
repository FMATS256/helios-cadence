import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type WorkspaceTab = { key: string; label: string };

const COLORFUL_TAB_STYLES = [
  "text-chart-2/70 hover:bg-chart-2/10 hover:text-chart-2 data-[status=active]:bg-chart-2/15 data-[status=active]:text-chart-2 data-[status=active]:border-chart-2/40",
  "text-amber/70 hover:bg-amber/10 hover:text-amber data-[status=active]:bg-amber/15 data-[status=active]:text-amber data-[status=active]:border-amber/40",
  "text-success/70 hover:bg-success/10 hover:text-success data-[status=active]:bg-success/15 data-[status=active]:text-success data-[status=active]:border-success/40",
  "text-info/70 hover:bg-info/10 hover:text-info data-[status=active]:bg-info/15 data-[status=active]:text-info data-[status=active]:border-info/40",
  "text-chart-3/70 hover:bg-chart-3/10 hover:text-chart-3 data-[status=active]:bg-chart-3/15 data-[status=active]:text-chart-3 data-[status=active]:border-chart-3/40",
  "text-teal/70 hover:bg-teal/10 hover:text-teal data-[status=active]:bg-teal/15 data-[status=active]:text-teal data-[status=active]:border-teal/40",
  "text-violet/70 hover:bg-violet/10 hover:text-violet data-[status=active]:bg-violet/15 data-[status=active]:text-violet data-[status=active]:border-violet/40",
];

/**
 * Shared tab strip used by merged workspaces (Finance, Inventory, Email, Storage).
 * Tabs are driven by the `?tab=` search param so they are deep-linkable.
 */
export function WorkspaceTabs({
  tabs, active, to, colorful = false, onBeforeChange,
}: {
  tabs: readonly WorkspaceTab[];
  active: string;
  to: string;
  colorful?: boolean;
  onBeforeChange?: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="flex gap-1 overflow-x-auto px-3 sm:px-6">
        {tabs.map((t, index) => (
          <Link
            key={t.key}
            to={to as any}
            search={{ tab: t.key } as any}
            resetScroll={false}
            onClick={() => t.key !== active && onBeforeChange?.()}
            className={cn(
              "shrink-0 rounded-md border px-3 py-2 text-sm font-semibold transition-colors my-1.5",
              colorful
                ? COLORFUL_TAB_STYLES[index % COLORFUL_TAB_STYLES.length]
                : active === t.key
                  ? "border-solar/40 bg-solar/15 text-solar"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

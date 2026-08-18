import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type WorkspaceTab = { key: string; label: string };

/**
 * Shared tab strip used by merged workspaces (Finance, Inventory, Email, Storage).
 * Tabs are driven by the `?tab=` search param so they are deep-linkable.
 */
export function WorkspaceTabs({
  tabs, active, to,
}: { tabs: readonly WorkspaceTab[]; active: string; to: string }) {
  return (
    <div className="sticky top-16 z-20 -mb-2 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="flex gap-1 overflow-x-auto px-3 sm:px-6">
        {tabs.map((t) => (
          <Link
            key={t.key}
            to={to as any}
            search={{ tab: t.key }}
            className={cn(
              "shrink-0 px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
              active === t.key
                ? "border-solar text-solar"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

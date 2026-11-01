import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer } from "@/components/page";
import { useRoles } from "@/hooks/use-roles";
import { useAuth } from "@/hooks/use-auth";
import { ExecutiveDashboard } from "@/components/dashboards/executive-dashboard";
import { FinanceDashboard } from "@/components/dashboards/finance-dashboard";
import { AccountManagerDashboard } from "@/components/dashboards/account-manager-dashboard";
import { SupportDashboard } from "@/components/dashboards/support-dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — IMT Operations Platform" },
      { name: "description", content: "Role-tailored command center: finance, account management, and support." },
      { property: "og:title", content: "Dashboard — IMT Operations Platform" },
      { property: "og:description", content: "Role-tailored command center: finance, account management, and support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const EXEC_ROLES = ["master_admin", "operations_manager"];
const FINANCE_ROLES = ["finance", "procurement"];
const AM_ROLES = ["account_manager", "corporate_account_manager", "customer_account_manager", "key_account_manager", "sales", "customer_success"];
const SUPPORT_ROLES = ["technical_support", "noc", "cyber_security", "cloud_engineer", "inventory"];

type View = "exec" | "finance" | "am" | "support";
const LABELS: Record<View, string> = { exec: "Executive", finance: "Finance", am: "Account Manager", support: "NOC & Support" };

function Dashboard() {
  const { roles } = useRoles();
  const { displayName, user } = useAuth();
  const has = (list: string[]) => roles.some((r) => list.includes(r));
  const isExec = has(EXEC_ROLES);
  // Executives can view every team dashboard; other staff see only their own team(s).
  const allowed: View[] = isExec
    ? ["exec", "finance", "am", "support"]
    : ([has(FINANCE_ROLES) && "finance", has(AM_ROLES) && "am", has(SUPPORT_ROLES) && "support"].filter(Boolean) as View[]);
  const [picked, setPicked] = useState<View | null>(null);
  const view: View | null = picked && allowed.includes(picked) ? picked : allowed[0] ?? null;

  return (
    <PageContainer>
      {allowed.length > 1 && (
        <div role="tablist" className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {allowed.map((v) => (
            <button key={v} role="tab" type="button" aria-selected={view === v} onClick={() => setPicked(v)}
              className={`shrink-0 border px-4 py-2 text-sm font-medium transition-colors active:scale-95 ${view === v ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
              {LABELS[v]}
            </button>
          ))}
        </div>
      )}
      {view === null && <p className="text-muted-foreground">No team dashboard is assigned to your role yet. Ask an administrator to add your team role.</p>}
      {view === "exec" && <ExecutiveDashboard displayName={displayName} />}
      {view === "finance" && <FinanceDashboard displayName={displayName} />}
      {view === "am" && <AccountManagerDashboard displayName={displayName} ownerId={isExec ? null : user?.id ?? null} />}
      {view === "support" && <SupportDashboard displayName={displayName} />}
    </PageContainer>
  );
}

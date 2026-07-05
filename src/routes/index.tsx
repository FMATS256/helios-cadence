import { createFileRoute } from "@tanstack/react-router";
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
    ],
  }),
  component: Dashboard,
});

const EXEC_ROLES = ["master_admin", "operations_manager"];
const FINANCE_ROLES = ["finance", "procurement"];
const AM_ROLES = ["account_manager", "sales", "customer_success"];
const SUPPORT_ROLES = ["technical_support", "noc", "cyber_security", "cloud_engineer", "inventory"];

function Dashboard() {
  const { roles } = useRoles();
  const { displayName } = useAuth();
  const has = (list: string[]) => roles.some((r) => list.includes(r));

  // Priority: exec > finance > AM > support > fallback exec
  const view: "exec" | "finance" | "am" | "support" = has(EXEC_ROLES)
    ? "exec"
    : has(FINANCE_ROLES)
    ? "finance"
    : has(AM_ROLES)
    ? "am"
    : has(SUPPORT_ROLES)
    ? "support"
    : "exec";

  return (
    <PageContainer>
      {view === "exec" && <ExecutiveDashboard displayName={displayName} />}
      {view === "finance" && <FinanceDashboard displayName={displayName} />}
      {view === "am" && <AccountManagerDashboard displayName={displayName} />}
      {view === "support" && <SupportDashboard displayName={displayName} />}
    </PageContainer>
  );
}

import type { AppRole } from "@/lib/admin.functions";

/**
 * Department-based page access. One map drives the staff menu, the page guard
 * and the dashboard switcher so they never disagree. Database policies mirror
 * these groups (is_finance_staff / is_tech_staff / is_sales_staff).
 */
export const DEPARTMENTS = {
  admin: ["master_admin", "operations_manager"],
  finance: ["finance", "procurement"],
  sales: ["sales", "account_manager", "corporate_account_manager", "customer_account_manager", "key_account_manager", "customer_success"],
  tech: ["technical_support", "noc", "cyber_security", "cloud_engineer"],
  inventory: ["inventory", "procurement"],
  readonly: ["read_only"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Department = keyof typeof DEPARTMENTS;

export function departmentsOf(roles: readonly string[]): Department[] {
  return (Object.keys(DEPARTMENTS) as Department[]).filter((d) =>
    (DEPARTMENTS[d] as readonly string[]).some((r) => roles.includes(r)),
  );
}

export type Rule = { prefix: string; allow: Department[] | "all" | "master" };

// Longest matching prefix wins. "admin" (master admin + ops manager) is added to every rule.
export const RULES: Rule[] = [
  { prefix: "/", allow: "all" },
  { prefix: "/customers", allow: "all" },
  { prefix: "/tickets", allow: "all" },
  { prefix: "/knowledge", allow: "all" },
  { prefix: "/notifications", allow: "all" },
  { prefix: "/inbox", allow: "all" },
  { prefix: "/assistant", allow: "all" },
  { prefix: "/catalog", allow: "all" },
  { prefix: "/projects", allow: ["finance", "sales", "tech"] },
  // Finance
  { prefix: "/finance", allow: ["finance"] },
  { prefix: "/finance-agent", allow: ["finance"] },
  { prefix: "/payments", allow: ["finance", "sales", "tech"] },
  { prefix: "/expenses", allow: ["finance"] },
  { prefix: "/money", allow: ["finance"] },
  { prefix: "/billing", allow: ["finance"] },
  { prefix: "/invoices", allow: ["finance", "sales", "tech"] },
  { prefix: "/refunds", allow: ["finance"] },
  { prefix: "/reports", allow: ["finance", "sales", "tech", "inventory", "readonly"] },
  { prefix: "/procurement", allow: ["finance", "inventory"] },
  // Sales / account management
  { prefix: "/leads", allow: ["sales", "finance"] },
  { prefix: "/account-manager", allow: ["sales"] },
  { prefix: "/quotes", allow: ["sales", "finance"] },
  { prefix: "/communications", allow: ["sales", "finance"] },
  // Technical
  { prefix: "/noc", allow: ["tech"] },
  { prefix: "/techops", allow: ["tech"] },
  { prefix: "/techops/vault", allow: ["tech"] },
  { prefix: "/credentials", allow: ["tech"] },
  { prefix: "/reset-password", allow: ["tech", "sales"] },
  { prefix: "/cloud-ops", allow: ["tech", "sales", "finance"] },
  { prefix: "/managed-cloud", allow: ["tech", "sales", "finance"] },
  { prefix: "/starlink", allow: ["tech", "sales", "finance"] },
  { prefix: "/web-hosting", allow: ["tech", "sales", "finance"] },
  { prefix: "/cloud-storage", allow: ["tech", "sales", "finance"] },
  { prefix: "/voip", allow: ["tech", "sales", "finance"] },
  { prefix: "/sophos", allow: ["tech", "sales", "finance"] },
  { prefix: "/veeam", allow: ["tech", "sales", "finance"] },
  { prefix: "/kaspersky", allow: ["tech", "sales", "finance"] },
  { prefix: "/microsoft-365", allow: ["tech", "sales", "finance"] },
  { prefix: "/zoho", allow: ["tech", "sales", "finance"] },
  // Stock
  { prefix: "/inventory", allow: ["inventory", "finance", "sales", "tech"] },
  { prefix: "/pos", allow: ["sales", "inventory", "finance"] },
  // Administration
  { prefix: "/automation", allow: [] },
  { prefix: "/settings", allow: [] },
  { prefix: "/email-studio", allow: "master" },
  { prefix: "/admin", allow: "master" },
  { prefix: "/client/access", allow: "master" },
];

function matchRule(pathname: string): Rule | null {
  let best: Rule | null = null;
  for (const r of RULES) {
    const hit = r.prefix === "/" ? pathname === "/" : pathname === r.prefix || pathname.startsWith(r.prefix + "/") || pathname.startsWith(r.prefix + ".");
    if (hit && (!best || r.prefix.length > best.prefix.length)) best = r;
  }
  return best;
}

/** True only for engineer accounts: technical roles with no admin, finance or sales role. */
export function isNocWorkstation(roles: readonly string[]): boolean {
  const deps = departmentsOf(roles);
  return deps.includes("tech") && !deps.some((d) => d === "admin" || d === "finance" || d === "sales") && !roles.includes("master_admin");
}

/** Whether a staff member with these roles may open the page. Unlisted pages stay open to staff. */
export function canOpenPage(pathname: string, roles: readonly string[]): boolean {
  if (roles.includes("master_admin")) return true;
  const rule = matchRule(pathname);
  if (!rule || rule.allow === "all") return true;
  if (rule.allow === "master") return false;
  const deps = departmentsOf(roles);
  if (deps.includes("admin")) return true;
  return rule.allow.some((d) => deps.includes(d));
}

import type { AppRole } from "@/lib/admin.functions";

/**
 * Central permission matrix. Each key is a capability; the value lists the
 * roles allowed to use it. `master_admin` implicitly has every permission.
 */
export const PERMISSIONS = {
  // Customers
  "customers.create": ["operations_manager", "sales", "account_manager"],
  "customers.edit":   ["operations_manager", "sales", "account_manager"],
  "customers.delete": [],

  // Service catalog
  "catalog.view":     ["operations_manager", "finance", "sales", "account_manager", "customer_success"],
  "catalog.manage":   ["operations_manager", "finance"],

  // Services / subscriptions on a customer
  "services.assign": ["operations_manager", "finance", "sales", "account_manager"],
  "services.remove": ["operations_manager", "finance", "account_manager"],

  // Billing
  "billing.view":    ["operations_manager", "finance", "account_manager"],
  "billing.manage":  ["operations_manager", "finance"],
  "payments.record": ["operations_manager", "finance", "account_manager"],

  // Tickets
  "tickets.view":    ["operations_manager", "technical_support", "customer_success", "account_manager", "noc"],
  "tickets.manage":  ["operations_manager", "technical_support", "customer_success", "noc"],

  // Cloud
  "cloud.view":      ["operations_manager", "cloud_engineer", "technical_support", "account_manager", "noc"],
  "cloud.manage":    ["operations_manager", "cloud_engineer"],

  // Credentials vault
  "credentials.view":   ["operations_manager", "cloud_engineer", "technical_support", "cyber_security"],
  "credentials.manage": ["operations_manager", "cloud_engineer", "cyber_security"],

  // Monitoring
  "monitoring.view": ["operations_manager", "noc", "cloud_engineer", "technical_support", "cyber_security"],

  // Commercially sensitive figures (supplier cost, margin, profit, wholesale).
  // Mirrors the server-side redaction in src/lib/security/redaction.server.ts.
  "costs.view":      ["finance", "operations_manager"],

  // Admin
  "admin.users":     [] as AppRole[],
} satisfies Record<string, AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: AppRole[], permission: Permission): boolean {
  if (roles.includes("master_admin")) return true;
  const allowed = PERMISSIONS[permission];
  return roles.some((r) => (allowed as readonly AppRole[]).includes(r));
}

export function canAny(roles: AppRole[], perms: Permission[]): boolean {
  return perms.some((p) => can(roles, p));
}

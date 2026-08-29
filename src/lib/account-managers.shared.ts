/** Shared account-manager constants (safe for client + server). */

export const AM_ROLES = [
  "key_account_manager",
  "corporate_account_manager",
  "customer_account_manager",
  "account_manager",
] as const;

export type AmRole = (typeof AM_ROLES)[number];

export const AM_ROLE_LABEL: Record<AmRole, string> = {
  key_account_manager: "Key Account Manager",
  corporate_account_manager: "Corporate Account Manager",
  customer_account_manager: "Customer Account Manager",
  account_manager: "Account Manager",
};

/** Single shared hotline used on every customer communication. */
export const AM_PHONE = "+263 86 12 004321";

/** Preferred role order when auto-assigning by account type. */
export function preferredRolesFor(accountType?: string | null): AmRole[] {
  return accountType === "personal"
    ? ["customer_account_manager", "account_manager", "corporate_account_manager", "key_account_manager"]
    : ["corporate_account_manager", "key_account_manager", "account_manager", "customer_account_manager"];
}

/** Short role prefix used inside the account-manager code. */
const AM_ROLE_PREFIX: Record<AmRole, string> = {
  key_account_manager: "KAM",
  corporate_account_manager: "CAM",
  customer_account_manager: "AMC",
  account_manager: "AM",
};

/**
 * Deterministic, human-readable account-manager code, e.g. "CAM-MM07".
 * Prefix = manager category, initials = manager name, suffix = stable id digits.
 */
export function amCode(manager?: { id: string; full_name?: string | null; email?: string | null; role?: string | null } | null): string {
  if (!manager) return "UNASSIGNED";
  const prefix = AM_ROLE_PREFIX[(manager.role as AmRole)] ?? "AM";
  const source = (manager.full_name || manager.email || "").replace(/[^a-zA-Z ]/g, " ").trim();
  const initials = source
    ? source.split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")
    : "XX";
  const digits = (manager.id.replace(/\D/g, "") + "00").slice(0, 2);
  return `${prefix}-${initials}${digits}`;
}

/** "CAM-MM07 · Mitchell Mukaira" label used across the UI. */
export function amLabel(manager?: { id: string; full_name?: string | null; email?: string | null; role?: string | null } | null): string {
  if (!manager) return "Unassigned";
  return `${amCode(manager)} · ${manager.full_name || manager.email || "Account Manager"}`;
}

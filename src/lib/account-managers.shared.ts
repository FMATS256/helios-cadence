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

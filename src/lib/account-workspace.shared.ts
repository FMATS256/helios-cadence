export const ACCOUNT_WORKSPACE_ROLES = ["master_admin", "operations_manager", "sales", "customer_success", "account_manager", "corporate_account_manager", "customer_account_manager", "key_account_manager", "noc", "technical_support", "cloud_engineer"];
export const RECOVERY_ROLES = ["master_admin", "operations_manager", "noc", "technical_support"];
export function canRecoverPortal(roles: readonly string[]) {
  return roles.some((role) => RECOVERY_ROLES.includes(role));
}
export function ownPortfolioOnly(roles: readonly string[]) {
  return !roles.some((role) => ["master_admin", "operations_manager", "noc", "technical_support", "cloud_engineer"].includes(role));
}
export function recoveryTargetAllowed(customerId: string, profile: { customer_id: string | null }, targetRoles: readonly string[]) {
  return profile.customer_id === customerId && targetRoles.length === 0;
}
export function portfolioCustomerAllowed(roles: readonly string[], userId: string, managerId: string | null) {
  return !ownPortfolioOnly(roles) || managerId === userId;
}

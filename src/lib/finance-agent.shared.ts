export const FINANCE_AGENT_ROLES = {
  invoice_reminders: "Chase open and overdue invoices with payment reminder emails",
  payment_matching: "Match client payment submissions to the right invoices",
  expense_review: "Review pending expenses and recommend approve or reject",
} as const;

export type FinanceAgentRole = keyof typeof FINANCE_AGENT_ROLES;

export const ROLE_LABELS: Record<FinanceAgentRole | "general", string> = {
  general: "Any allowed duty",
  invoice_reminders: "Invoice reminders",
  payment_matching: "Payment matching",
  expense_review: "Expense review",
};

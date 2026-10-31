export const ASSISTANT_ROLES = {
  email_summary: "Summarise my emails and highlight what needs my attention",
  reply_drafting: "Draft replies to emails for me to review (never sends anything)",
  daily_briefing: "Prepare a daily briefing of unreplied emails, tickets and alerts",
  client_followups: "Track my client accounts and suggest follow-ups",
  client_actions: "Prepare client emails, quotations and follow-ups from the Ammara mailbox, sent only after my approval",
} as const;
export type AssistantRole = keyof typeof ASSISTANT_ROLES;
export const ASSISTANT_ROLE_LABELS: Record<AssistantRole, string> = {
  email_summary: "Email summaries",
  reply_drafting: "Reply drafting",
  daily_briefing: "Daily briefing",
  client_followups: "Client follow-ups",
  client_actions: "Emails & quotations (with approval)",
};

/** Roles a task may use: a general task gets every enabled role, a specific task only its own enabled role. */
export function allowedAssistantRoles(enabled: string[], taskRole: string): AssistantRole[] {
  const valid = enabled.filter((r): r is AssistantRole => r in ASSISTANT_ROLES);
  return taskRole === "general" ? valid : valid.filter((r) => r === taskRole);
}

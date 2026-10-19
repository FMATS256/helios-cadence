/** Shared inbox types/constants (safe for client + server). */

export const MAIL_DOMAIN = "imtsolutions.co.zw";
export const SALES_INBOX = `sales@${MAIL_DOMAIN}`;
export const DEPARTMENT_MAILBOXES = [
  { department: "Account Managers", addresses: [SALES_INBOX], roles: ["sales", "account_manager", "corporate_account_manager", "customer_account_manager", "key_account_manager"] },
  { department: "Accounting", addresses: [`accounts@${MAIL_DOMAIN}`, `billing@${MAIL_DOMAIN}`], roles: ["finance"] },
  { department: "Technical", addresses: [`support@${MAIL_DOMAIN}`, `helpdesk@${MAIL_DOMAIN}`], roles: ["technical_support", "cloud_engineer", "cyber_security", "noc"] },
];
/** True for shared department mailboxes (sales@, accounts@...); false for a staff member's own inbox. */
export function isDepartmentMailbox(address?: string | null) {
  const a = String(address ?? SALES_INBOX).toLowerCase();
  return DEPARTMENT_MAILBOXES.some((d) => d.addresses.includes(a));
}
export function mailboxesForRoles(roles: string[]) {
  return DEPARTMENT_MAILBOXES.filter((d) => roles.some((r) => d.roles.includes(r)) || roles.some((r) => ["master_admin", "operations_manager"].includes(r)));
}
export type EmailDraft = { to?: string; cc?: string; bcc?: string; subject?: string; html: string; quoteId?: string; mailbox?: string; files?: { filename: string; contentType: string; base64: string; size: number }[]; updatedAt?: string };
export type EmailOrganization = { flagged?: boolean; pinned?: boolean; unread?: boolean; category?: string };

export type EnquiryStatus = "open" | "awaiting_customer" | "closed";

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  open: "Needs reply",
  awaiting_customer: "Awaiting customer",
  closed: "Closed",
};

export interface EnquiryListItem {
  id: string;
  reference: string;
  subject: string;
  contact_email: string;
  contact_name: string | null;
  status: EnquiryStatus;
  message_count: number;
  last_message_at: string | null;
  last_inbound_at: string | null;
  assigned_am_id: string | null;
  customer_id: string | null;
  customer_account_number: string | null;
  customer_name: string | null;
  am_name: string | null;
  replied_by?: string | null;
  mailbox_address?: string;
}

export interface InboxMessage {
  id: string;
  enquiry_id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  to_address: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  delivery_status: string;
  delivery_error: string | null;
  created_at: string;
  sender_name?: string | null;
  created_by?: string | null;
  cc_address?: string | null;
  attachments: { id: string; filename: string; content_type: string | null; size_bytes: number | null }[];
}

export interface EnquiryThread {
  enquiry: EnquiryListItem & { created_at: string; assigned_at: string | null };
  messages: InboxMessage[];
}

/** Reference format, e.g. IMTQSD20354. */
export const ENQUIRY_REF_REGEX = /IMTQSD\s?(\d{5})/i;

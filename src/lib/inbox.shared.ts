/** Shared inbox types/constants (safe for client + server). */

export const MAIL_DOMAIN = "imtsolutions.co.zw";
export const SALES_INBOX = `sales@${MAIL_DOMAIN}`;

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
  attachments: { id: string; filename: string; content_type: string | null; size_bytes: number | null }[];
}

export interface EnquiryThread {
  enquiry: EnquiryListItem & { created_at: string; assigned_at: string | null };
  messages: InboxMessage[];
}

/** Reference format, e.g. IMTQSD20354. */
export const ENQUIRY_REF_REGEX = /IMTQSD\s?(\d{5})/i;

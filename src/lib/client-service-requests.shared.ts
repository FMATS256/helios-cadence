import { z } from "zod";
import { kindForCategory, type ProvisionKind } from "./service-provision.shared";

export type RequestField = { key: string; label: string; required?: boolean; placeholder?: string; type?: "text" | "number" | "email" | "textarea" };

/** Details a client must supply when requesting each kind of service. Passwords are never collected here; IMT issues them securely. */
export const CLIENT_REQUEST_FIELDS: Record<ProvisionKind, RequestField[]> = {
  starlink: [
    { key: "site_address", label: "Installation address", required: true },
    { key: "site_contact", label: "Site contact name & phone", required: true },
  ],
  hosting: [
    { key: "domain", label: "Domain", required: true, placeholder: "example.co.zw" },
    { key: "mailbox_names", label: "Mailboxes needed (name & address)", type: "textarea", placeholder: "Jane Doe — jane@example.co.zw" },
  ],
  domain: [
    { key: "domain", label: "Domain name wanted", required: true, placeholder: "example.co.zw" },
    { key: "registrant", label: "Registered owner (company or person)", required: true },
  ],
  "cloud-storage": [
    { key: "storage_tb", label: "Storage needed (TB)", required: true, type: "number" },
    { key: "users", label: "Number of users", type: "number" },
  ],
  "managed-nas": [
    { key: "capacity_tb", label: "Capacity needed (TB)", required: true, type: "number" },
    { key: "location", label: "Site / location", required: true },
  ],
  vps: [
    { key: "purpose", label: "What will the server run?", required: true, placeholder: "e.g. Sage Pastel, website" },
    { key: "os", label: "Operating system", placeholder: "Windows / Linux" },
  ],
  cloud: [{ key: "purpose", label: "What do you need it for?", required: true }],
  license: [
    { key: "users", label: "Users (full name & email, one per line)", required: true, type: "textarea", placeholder: "Jane Doe — jane@example.co.zw" },
    { key: "tenant_domain", label: "Company domain", placeholder: "example.co.zw" },
  ],
  voip: [
    { key: "extensions", label: "Number of extensions", required: true, type: "number" },
    { key: "extension_users", label: "Extension users (name per line)", type: "textarea" },
    { key: "phone_number", label: "Preferred / existing phone number" },
    { key: "features", label: "Features (IVR, call recording, queues…)" },
  ],
  none: [],
};

export function requestFieldsFor(category: string) {
  return CLIENT_REQUEST_FIELDS[kindForCategory(category)];
}

export const serviceRequestSchema = z.object({
  type: z.enum(["add", "upgrade", "quote"]),
  catalog_id: z.string().uuid().nullable(),
  current_service: z.string().trim().max(200).nullable(),
  quantity: z.number().int().min(1).max(10000),
  details: z.record(z.string(), z.string().trim().max(4000)),
  notes: z.string().trim().max(4000),
}).strict();

export function missingRequired(category: string, details: Record<string, string>) {
  return requestFieldsFor(category).filter((f) => f.required && !details[f.key]?.trim()).map((f) => f.label);
}

export function describeRequest(input: z.infer<typeof serviceRequestSchema>, item: { name: string; code: string; category: string; unit_price: number; currency: string; billing_cycle: string } | null) {
  const title = { add: "New service request", upgrade: "Plan upgrade request", quote: "Quotation request" }[input.type];
  const lines = [`${title} — awaiting account manager confirmation`];
  if (input.current_service) lines.push(`Current service: ${input.current_service}`);
  if (item) lines.push(`Requested: ${item.name} (${item.code}) · ${item.currency} ${Number(item.unit_price).toFixed(2)} / ${item.billing_cycle}`);
  lines.push(`Quantity: ${input.quantity}`);
  const fields = item ? requestFieldsFor(item.category) : [];
  for (const f of fields) if (input.details[f.key]?.trim()) lines.push(`${f.label}: ${input.details[f.key].trim()}`);
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  return { subject: `${title}: ${item?.name ?? input.current_service ?? "services"}`.slice(0, 200), description: lines.join("\n") };
}

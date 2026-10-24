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

/** Extras for an existing service (add a user, seat, mailbox, extension…). Never asks for installation details. */
export const CLIENT_ADDON_FIELDS: Record<ProvisionKind, { action: string; fields: RequestField[] }> = {
  starlink: { action: "Request a change", fields: [{ key: "change", label: "What would you like changed?", required: true, type: "textarea", placeholder: "e.g. add data top-up, relocate kit" }] },
  hosting: { action: "Add mailbox", fields: [
    { key: "full_name", label: "User's full name", required: true },
    { key: "mailbox", label: "Email address wanted", required: true, placeholder: "jane@yourdomain.co.zw" },
    { key: "quota_mb", label: "Mailbox size (MB)", type: "number", placeholder: "1024" },
  ] },
  domain: { action: "Request a change", fields: [{ key: "change", label: "What would you like changed?", required: true, type: "textarea" }] },
  "cloud-storage": { action: "Add storage / users", fields: [
    { key: "extra_tb", label: "Extra storage (TB)", type: "number" },
    { key: "new_users", label: "New users (name & email, one per line)", type: "textarea" },
  ] },
  "managed-nas": { action: "Add capacity", fields: [{ key: "extra_tb", label: "Extra capacity (TB)", required: true, type: "number" }] },
  vps: { action: "Add resources", fields: [{ key: "resources", label: "Resources needed (CPU, RAM, disk)", required: true }] },
  cloud: { action: "Add resources", fields: [{ key: "resources", label: "What do you need added?", required: true, type: "textarea" }] },
  license: { action: "Add user", fields: [
    { key: "full_name", label: "New user's full name", required: true },
    { key: "email", label: "Email address wanted", required: true, placeholder: "jane@yourdomain.co.zw" },
    { key: "job_title", label: "Job title / department" },
  ] },
  voip: { action: "Add extension", fields: [
    { key: "extension_user", label: "Extension user's name", required: true },
    { key: "extension_number", label: "Preferred extension number", placeholder: "e.g. 205" },
    { key: "department", label: "Department" },
    { key: "features", label: "Features (voicemail, call recording…)" },
  ] },
  none: { action: "Request a change", fields: [{ key: "change", label: "What would you like changed?", required: true, type: "textarea" }] },
};

export type RequestType = "add" | "upgrade" | "quote" | "addon";

/** Fields to show for a request. Upgrades only change the package, so they never ask for installation details. */
export function requestFieldsFor(category: string, type: RequestType = "add") {
  const kind = kindForCategory(category);
  if (type === "upgrade") return [];
  if (type === "addon") return CLIENT_ADDON_FIELDS[kind].fields;
  return CLIENT_REQUEST_FIELDS[kind];
}

export function addonActionFor(category: string) { return CLIENT_ADDON_FIELDS[kindForCategory(category)].action; }

export const serviceRequestSchema = z.object({
  type: z.enum(["add", "upgrade", "quote", "addon"]),
  catalog_id: z.string().uuid().nullable(),
  category: z.string().trim().max(100).nullable().optional(),
  current_service: z.string().trim().max(200).nullable(),
  quantity: z.number().int().min(1).max(10000),
  details: z.record(z.string(), z.string().trim().max(4000)),
  notes: z.string().trim().max(4000),
}).strict();

export function missingRequired(category: string, details: Record<string, string>, type: RequestType = "add") {
  return requestFieldsFor(category, type).filter((f) => f.required && !details[f.key]?.trim()).map((f) => f.label);
}

export function describeRequest(input: z.infer<typeof serviceRequestSchema>, item: { name: string; code: string; category: string; unit_price: number; currency: string; billing_cycle: string } | null) {
  const title = { add: "New service request", upgrade: "Plan upgrade request", quote: "Quotation request", addon: "Service change request" }[input.type];
  const lines = [`${title} — awaiting account manager confirmation`];
  if (input.current_service) lines.push(`Current service: ${input.current_service}`);
  if (item) lines.push(`Requested: ${item.name} (${item.code}) · ${item.currency} ${Number(item.unit_price).toFixed(2)} / ${item.billing_cycle}`);
  lines.push(`Quantity: ${input.quantity}`);
  const category = item?.category ?? input.category ?? null;
  const fields = category ? requestFieldsFor(category, input.type) : [];
  for (const f of fields) if (input.details[f.key]?.trim()) lines.push(`${f.label}: ${input.details[f.key].trim()}`);
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  const what = input.type === "addon" && category ? `${addonActionFor(category)} — ${input.current_service ?? "service"}` : item?.name ?? input.current_service ?? "services";
  return { subject: `${title}: ${what}`.slice(0, 200), description: lines.join("\n") };
}

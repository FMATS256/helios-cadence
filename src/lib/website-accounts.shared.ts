import { z } from "zod";

/** Website applications cannot choose internal ownership, status or financial terms. */
export const websiteAccountSchema = z.object({
  external_id: z.string().trim().min(1).max(200),
  category: z.enum(["personal", "company", "corporate", "key_account"]),
  name: z.string().trim().min(2).max(300),
  contact_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(5).max(50),
  industry: z.string().trim().max(200).optional(),
  billing_address: z.string().trim().max(2000).optional(),
}).strict();

export type WebsiteAccountInput = z.infer<typeof websiteAccountSchema>;
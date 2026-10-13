import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { ingestNormalizedEmail } from "@/lib/inbox.server";

const addressList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v == null ? [] : Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean)));

const Attachment = z.object({
  filename: z.string().max(500).nullish(),
  content_type: z.string().max(200).nullish(),
  size: z.number().nullish(),
  size_bytes: z.number().nullish(),
  path: z.string().max(4000).nullish(),
  id: z.string().max(500).nullish(),
  url: z.string().max(4000).nullish(),
  download_url: z.string().max(4000).nullish(),
  content: z.string().max(22_000_000).nullish(),
  content_id: z.string().max(500).nullish(),
});

// Exact shape pushed by the IMT Solutions website email gateway.
const GatewayEnvelope = z.object({
  type: z.literal("email.received"),
  enquiry: z
    .object({
      id: z.string().nullish(),
      reference: z.string().max(50).nullish(),
      customer_email: z.string().max(500).nullish(),
      customer_name: z.string().max(500).nullish(),
      subject: z.string().max(2000).nullish(),
      status: z.string().max(50).nullish(),
    })
    .nullish(),
  data: z.object({
    id: z.string().nullish(),
    direction: z.string().nullish(),
    enquiry_id: z.string().nullish(),
    provider_id: z.string().min(1).max(300),
    message_id: z.string().max(998).nullish(),
    in_reply_to: z.string().max(998).nullish(),
    references_header: z.string().max(20_000).nullish(),
    thread_id: z.string().max(998).nullish(),
    from_address: z.string().min(3).max(500),
    to_addresses: addressList,
    cc_addresses: addressList,
    subject: z.string().max(2000).nullish(),
    html: z.string().max(2_000_000).nullish(),
    text_body: z.string().max(1_000_000).nullish(),
    attachments: z.array(Attachment).max(50).nullish(),
    status: z.string().max(50).nullish(),
    created_at: z.string().max(64).nullish(),
  }),
});

// Legacy flat shape (kept so older gateway builds keep working).
const FlatPayload = z.object({
  provider_id: z.string().min(1).max(300),
  message_id: z.string().max(998).nullish(),
  thread_id: z.string().max(300).nullish(),
  from: z.string().min(3).max(500),
  to: addressList,
  cc: addressList,
  subject: z.string().max(2000).nullish(),
  html: z.string().max(2_000_000).nullish(),
  text: z.string().max(1_000_000).nullish(),
  in_reply_to: z.string().max(998).nullish(),
  references_header: z.string().max(20_000).nullish(),
  received_at: z.string().max(64).nullish(),
  attachments: z.array(Attachment).max(50).nullish(),
});

function mapAttachments(list: z.infer<typeof Attachment>[] | null | undefined) {
  return (list ?? []).map((att) => ({
    filename: att.filename || "attachment",
    content_type: att.content_type ?? null,
    size_bytes: att.size_bytes ?? att.size ?? null,
    // Gateway attachments are private storage paths; keep the path (or a URL
    // when provided) so the file can be fetched from the gateway later.
    attachment_id: att.download_url ?? att.url ?? att.path ?? att.id ?? null,
    content: att.content ?? null,
    content_id: att.content_id ?? null,
  }));
}

export const Route = createFileRoute("/api/public/email/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.IMT_EMAIL_API_KEY;
        if (!key) return Response.json({ error: "Gateway key not configured" }, { status: 503 });

        const raw = await request.text();
        const provided = (request.headers.get("x-imt-signature") ?? "").trim().toLowerCase().replace(/^sha256=/, "");
        const expected = createHmac("sha256", key).update(raw).digest("hex");
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        let input: Parameters<typeof ingestNormalizedEmail>[0];
        let referenceHint: string | null = null;
        let contactNameHint: string | null = null;

        const envelope = GatewayEnvelope.safeParse(json);
        if (envelope.success) {
          const d = envelope.data.data;
          referenceHint = envelope.data.enquiry?.reference ?? null;
          contactNameHint = envelope.data.enquiry?.customer_name ?? null;
          input = {
            providerId: d.provider_id,
            messageId: d.message_id ?? null,
            from: d.from_address,
            to: d.to_addresses,
            cc: d.cc_addresses,
            subject: d.subject ?? null,
            html: d.html ?? null,
            text: d.text_body ?? null,
            inReplyTo: d.in_reply_to ?? null,
            references: d.references_header ?? d.thread_id ?? null,
            receivedAt: d.created_at ?? null,
            attachments: mapAttachments(d.attachments),
            referenceHint,
            contactNameHint,
          };
        } else {
          const flat = FlatPayload.safeParse(json);
          if (!flat.success) {
            return Response.json(
              { error: "Invalid payload", issues: flat.error.issues.slice(0, 10) },
              { status: 400 },
            );
          }
          const p = flat.data;
          input = {
            providerId: p.provider_id,
            messageId: p.message_id ?? null,
            from: p.from,
            to: p.to,
            cc: p.cc,
            subject: p.subject ?? null,
            html: p.html ?? null,
            text: p.text ?? null,
            inReplyTo: p.in_reply_to ?? null,
            references: p.references_header ?? null,
            receivedAt: p.received_at ?? null,
            attachments: mapAttachments(p.attachments),
          };
        }

        const result = await ingestNormalizedEmail(input);

        if (result.status === "skipped") {
          console.error("[email-inbound] skipped:", result.error);
          return Response.json({ ok: false, status: result.status, error: result.error }, { status: 422 });
        }
        return Response.json({ ok: true, status: result.status, reference: result.reference ?? null });
      },
    },
  },
});

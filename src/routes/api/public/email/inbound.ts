import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { ingestNormalizedEmail } from "@/lib/inbox.server";

const addressList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v == null ? [] : Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean)));

const Payload = z.object({
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
  attachments: z
    .array(
      z.object({
        filename: z.string().max(500).nullish(),
        content_type: z.string().max(200).nullish(),
        size: z.number().nullish(),
        size_bytes: z.number().nullish(),
        id: z.string().max(500).nullish(),
        url: z.string().max(4000).nullish(),
        download_url: z.string().max(4000).nullish(),
      }),
    )
    .max(50)
    .nullish(),
});

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
        const parsed = Payload.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Invalid payload", issues: parsed.error.issues.slice(0, 10) }, { status: 400 });
        }
        const p = parsed.data;

        const result = await ingestNormalizedEmail({
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
          attachments: (p.attachments ?? []).map((att) => ({
            filename: att.filename || "attachment",
            content_type: att.content_type ?? null,
            size_bytes: att.size_bytes ?? att.size ?? null,
            attachment_id: att.download_url ?? att.url ?? att.id ?? null,
          })),
        });

        if (result.status === "skipped") {
          console.error("[email-inbound] skipped:", result.error);
          return Response.json({ ok: false, status: result.status, error: result.error }, { status: 422 });
        }
        return Response.json({ ok: true, status: result.status, reference: result.reference ?? null });
      },
    },
  },
});

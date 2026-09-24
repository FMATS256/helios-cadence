import { createFileRoute } from "@tanstack/react-router";
import { ingestReceivedEmail, verifyInboundSignature } from "@/lib/inbox.server";

/**
 * Resend Receiving webhook (`email.received`).
 *
 * Resend signs deliveries with Svix headers. Set RESEND_WEBHOOK_SECRET to the
 * signing secret shown in the Resend webhook settings, and point the webhook
 * at: https://<project>.lovable.app/api/public/hooks/email-inbound
 */
export const Route = createFileRoute("/api/public/hooks/email-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const check = verifyInboundSignature(raw, request.headers);
        if (!check.ok) {
          console.error("[email-inbound] signature rejected:", check.reason);
          return new Response(`Signature verification failed (${check.reason})`, { status: 401 });
        }

        let event: any;
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (event.type !== "email.received") {
          return Response.json({ ignored: event.type ?? "unknown" });
        }

        try {
          const result = await ingestReceivedEmail(event);
          if (result.status === "skipped") {
            // Permanent ingest failure — tell Resend so the delivery is retried.
            return Response.json(result, { status: 422 });
          }
          return Response.json(result);
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          console.error("[email-inbound] ingest error:", msg);
          // Not-yet-configured Resend key: 500 makes Resend retry later.
          return new Response(msg, { status: msg.includes("RESEND_NOT_CONNECTED") ? 503 : 500 });
        }
      },
      GET: async () => Response.json({ endpoint: "email-inbound", status: "ok" }),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/finance-statements")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env.AGENT_WEBHOOK_SECRET;
    const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!secret || !supplied) return new Response("Unauthorized", { status: 401 });
    const a = Buffer.from(secret), b = Buffer.from(supplied);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });
    try {
      const { sendMonthlyStatements } = await import("@/lib/finance-statements.server");
      return Response.json(await sendMonthlyStatements());
    } catch { return Response.json({ error: "Monthly statement processing failed; Finance review required" }, { status: 500 }); }
  } } },
});
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/assistant-daily-report")({
  server: { handlers: { POST: async ({ request }) => {
    const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!supplied) return new Response("Unauthorized", { status: 401 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("finance_statement_schedule").select("callback_secret").eq("id", true).maybeSingle();
    const secret = data?.callback_secret as string | undefined;
    const a = Buffer.from(secret ?? ""), b = Buffer.from(supplied);
    if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });
    try {
      const { sendAllDailyReports } = await import("@/lib/personal-assistant-actions.server");
      return Response.json(await sendAllDailyReports());
    } catch { return Response.json({ error: "Daily report failed" }, { status: 500 }); }
  } } },
});

import { timingSafeEqual } from "crypto";

/** Scheduled/internal hooks: require `Authorization: Bearer <AGENT_WEBHOOK_SECRET>`. Returns a 401 response when denied. */
export function denyUnlessInternal(request: Request): Response | null {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!secret || !supplied) return new Response("Unauthorized", { status: 401 });
  const a = Buffer.from(secret), b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });
  return null;
}

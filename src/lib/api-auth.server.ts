// Auth helper for server routes (bypasses functionMiddleware).
// Requires "Authorization: Bearer <supabase access token>" header.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function requireBearer(request: Request): Promise<{ userId: string } | Response> {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return jsonError(401, "missing_bearer");
  }
  const token = auth.slice("Bearer ".length).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return jsonError(401, "invalid_token");
  return { userId: data.user.id };
}

export function jsonError(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

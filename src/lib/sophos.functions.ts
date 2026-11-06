import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sophos Central Partner integration point. Until SOPHOS_CLIENT_ID and
 * SOPHOS_CLIENT_SECRET exist, tenants and approved orders wait in "awaiting_api".
 * When credentials arrive, implement token exchange (id.sophos.com/api/v2/oauth2/token)
 * and POST /partner/v1/tenants inside syncSophosQueue.
 */
export const getSophosConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const connected = !!process.env["SOPHOS_CLIENT_ID"] && !!process.env["SOPHOS_CLIENT_SECRET"];
    return { connected };
  });

export const syncSophosQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const connected = !!process.env["SOPHOS_CLIENT_ID"] && !!process.env["SOPHOS_CLIENT_SECRET"];
    if (!connected) {
      return { ok: false, message: "Sophos is not connected yet. Items stay queued until API credentials are added." };
    }
    return { ok: false, message: "Sophos credentials found — provisioning calls still need to be enabled." };
  });

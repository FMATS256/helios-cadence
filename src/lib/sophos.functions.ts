import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VENDORS, type VendorId } from "@/lib/vendors";

/**
 * Vendor provisioning integration point. Each vendor stays "not connected" until
 * its credentials (see VENDORS[].envKeys) are saved; approved items then wait in
 * "awaiting_api" until the vendor's provisioning call is implemented here.
 */
export const getVendorConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const out: Record<string, boolean> = {};
    for (const v of VENDORS) out[v.id] = v.envKeys.every((k) => !!process.env[k]);
    return out as Record<VendorId, boolean>;
  });

export const syncVendorQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vendor: VendorId }) => d)
  .handler(async ({ data }) => {
    const v = VENDORS.find((x) => x.id === data.vendor);
    if (!v) throw new Error("Unknown vendor");
    if (!v.envKeys.every((k) => !!process.env[k])) {
      return { ok: false, message: `${v.name} is not connected yet. Approved items stay queued until API credentials are added.` };
    }
    return { ok: false, message: `${v.name} credentials found — provisioning calls still need to be enabled.` };
  });

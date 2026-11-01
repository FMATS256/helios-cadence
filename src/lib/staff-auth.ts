import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in staff only: rejects client-portal and role-less accounts on the server. */
export const requireStaffAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await (context as any).supabase.rpc("has_any_role", { _user_id: (context as any).userId });
    if (error) throw new Error("Could not verify staff access");
    if (!data) throw new Error("Your account needs a staff role to perform this action.");
    return next();
  });

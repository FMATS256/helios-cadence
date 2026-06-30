// GET /api/zoho/oauth/callback — exchanges code for tokens, stores connection
import { createFileRoute } from "@tanstack/react-router";
import { getCookie, deleteCookie } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { zohoAccountsUrl, type ZohoRegion } from "@/lib/zoho.server";

export const Route = createFileRoute("/api/zoho/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) return redirectTo(url.origin, `/zoho?error=${encodeURIComponent(error)}`);
        if (!code) return redirectTo(url.origin, "/zoho?error=missing_code");

        const expectedState = getCookie("zoho_oauth_state");
        const region = (getCookie("zoho_oauth_region") as ZohoRegion | undefined) ?? "com";
        if (!expectedState || expectedState !== state) {
          return redirectTo(url.origin, "/zoho?error=state_mismatch");
        }
        deleteCookie("zoho_oauth_state");
        deleteCookie("zoho_oauth_region");

        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return redirectTo(url.origin, "/zoho?error=missing_credentials");
        }

        const redirectUri = `${url.origin}/api/zoho/oauth/callback`;
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        });

        const res = await fetch(`${zohoAccountsUrl(region)}/oauth/v2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const json = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
          error?: string;
        };

        if (!res.ok || !json.access_token || !json.refresh_token) {
          return redirectTo(
            url.origin,
            `/zoho?error=${encodeURIComponent(json.error ?? "token_exchange_failed")}`,
          );
        }

        const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();

        // Replace any existing connection rows (org-wide singleton)
        await supabaseAdmin.from("zoho_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await supabaseAdmin.from("zoho_connections").insert({
          region,
          access_token: json.access_token,
          refresh_token: json.refresh_token,
          expires_at: expiresAt,
          scope: json.scope ?? null,
        });

        return redirectTo(url.origin, "/zoho?connected=1");
      },
    },
  },
});

function redirectTo(origin: string, path: string) {
  return Response.redirect(`${origin}${path}`, 302);
}

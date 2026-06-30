// GET /api/zoho/oauth/start — redirects user to Zoho authorization
import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";
import { zohoAccountsUrl, ZOHO_SCOPES, type ZohoRegion } from "@/lib/zoho.server";

export const Route = createFileRoute("/api/zoho/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.ZOHO_CLIENT_ID;
        if (!clientId) return new Response("ZOHO_CLIENT_ID not configured", { status: 500 });

        const url = new URL(request.url);
        const region = (url.searchParams.get("region") as ZohoRegion | null) ?? "com";
        const redirectUri = `${url.origin}/api/zoho/oauth/callback`;

        const state = crypto.randomUUID();
        setCookie("zoho_oauth_state", state, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 600,
        });
        setCookie("zoho_oauth_region", region, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 600,
        });

        const auth = new URL(`${zohoAccountsUrl(region)}/oauth/v2/auth`);
        auth.searchParams.set("scope", ZOHO_SCOPES);
        auth.searchParams.set("client_id", clientId);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("redirect_uri", redirectUri);
        auth.searchParams.set("access_type", "offline");
        auth.searchParams.set("prompt", "consent");
        auth.searchParams.set("state", state);

        return Response.redirect(auth.toString(), 302);
      },
    },
  },
});

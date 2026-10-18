import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/email/accounts/open")({
  server: { handlers: { POST: async ({ request }) => {
    const { openWebsiteAccount } = await import("@/lib/website-accounts.server");
    return openWebsiteAccount(request);
  } } },
});
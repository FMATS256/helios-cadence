import { createFileRoute } from "@tanstack/react-router";
import { ClientPortalView, portalHead } from "@/components/client-account-portal";
export const Route = createFileRoute("/client/support")({ head: () => portalHead("Support", "Create support requests and follow replies from IMT Support."), component: () => <ClientPortalView section="support" /> });
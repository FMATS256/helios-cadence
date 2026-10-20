import { createFileRoute } from "@tanstack/react-router";
import { ClientPortalView, portalHead } from "@/components/client-account-portal";
export const Route = createFileRoute("/client/")({ head: () => portalHead("Account overview", "Your IMT account, invoice balances, payments and support activity."), component: () => <ClientPortalView section="overview" /> });
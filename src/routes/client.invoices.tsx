import { createFileRoute } from "@tanstack/react-router";
import { ClientPortalView, portalHead } from "@/components/client-account-portal";
export const Route = createFileRoute("/client/invoices")({ head: () => portalHead("Invoices", "View your IMT invoices, due dates and outstanding balances."), component: () => <ClientPortalView section="invoices" /> });
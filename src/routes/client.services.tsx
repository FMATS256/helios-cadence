import { createFileRoute } from "@tanstack/react-router";
import { ClientPortalView, portalHead } from "@/components/client-account-portal";
export const Route = createFileRoute("/client/services")({ head: () => portalHead("Services", "View your IMT subscriptions and renewal dates."), component: () => <ClientPortalView section="services" /> });
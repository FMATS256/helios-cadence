import { createFileRoute } from "@tanstack/react-router";
import { ClientAccessView, portalHead } from "@/components/client-account-portal";
export const Route = createFileRoute("/client/access")({ head: () => portalHead("Client access", "Administrator-managed client account sign-in links."), component: ClientAccessView });
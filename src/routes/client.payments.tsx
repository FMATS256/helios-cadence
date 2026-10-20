import { createFileRoute } from "@tanstack/react-router";
import { ClientPortalView, portalHead } from "@/components/client-account-portal";
export const Route = createFileRoute("/client/payments")({ head: () => portalHead("Payments", "Submit payment proof and track Finance verification and receipts."), component: () => <ClientPortalView section="payments" /> });
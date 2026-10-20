import { createFileRoute } from "@tanstack/react-router";
import { ClientPortalLayout } from "@/components/client-account-portal";
export const Route = createFileRoute("/client")({ component: ClientPortalLayout });
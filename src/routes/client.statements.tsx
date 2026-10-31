import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/components/client-account-portal";
import { ClientStatements } from "@/components/client-statements";

export const Route = createFileRoute("/client/statements")({
  head: () => portalHead("Account statements", "Download your IMT account statements, verified payments and account balances."),
  component: ClientStatements,
});
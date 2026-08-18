import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Invoices — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/finance" search={{ tab: "invoices" }} replace />,
});

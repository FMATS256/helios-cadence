import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/finance" search={{ tab: "payments" }} replace />,
});

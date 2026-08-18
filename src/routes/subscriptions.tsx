import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/finance" search={{ tab: "subscriptions" }} replace />,
});

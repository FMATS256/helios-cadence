import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/licenses")({
  head: () => ({ meta: [{ title: "Licenses — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/inventory" search={{ tab: "licenses" }} replace />,
});

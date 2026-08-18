import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [{ title: "Assets — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/inventory" search={{ tab: "assets" }} replace />,
});

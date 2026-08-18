import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/laptop-tracking")({
  head: () => ({ meta: [{ title: "Laptop Tracking — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/inventory" search={{ tab: "laptops" }} replace />,
});

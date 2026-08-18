import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/managed-nas")({
  head: () => ({ meta: [{ title: "Managed NAS — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/cloud-storage" search={{ tab: "nas" }} replace />,
});

import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/email-logs")({
  head: () => ({ meta: [{ title: "Email Logs — IMT Operations" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/email-studio" search={{ tab: "logs" }} replace />,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

// Merged into a hub; kept so old links and bookmarks still work.
export const Route = createFileRoute("/monitoring")({
  beforeLoad: () => { throw redirect({ to: "/noc", search: { tab: "uptime" }, replace: true }); },
});

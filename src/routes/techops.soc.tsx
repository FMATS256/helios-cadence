import { createFileRoute, redirect } from "@tanstack/react-router";

// Merged into a hub; kept so old links and bookmarks still work.
export const Route = createFileRoute("/techops/soc")({
  beforeLoad: () => { throw redirect({ to: "/noc", search: { tab: "security" }, replace: true }); },
});

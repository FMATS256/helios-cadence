import { createFileRoute, redirect } from "@tanstack/react-router";

// Merged into a hub; kept so old links and bookmarks still work.
export const Route = createFileRoute("/techops/equipment")({
  beforeLoad: () => { throw redirect({ to: "/techops/dashboard", search: { tab: "equipment" }, replace: true }); },
});

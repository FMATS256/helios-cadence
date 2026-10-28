import { createFileRoute, redirect } from "@tanstack/react-router";

// Merged into a hub; kept so old links and bookmarks still work.
export const Route = createFileRoute("/work-orders")({
  beforeLoad: () => { throw redirect({ to: "/techops/dashboard", search: { tab: "workorders" }, replace: true }); },
});

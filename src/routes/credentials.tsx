import { createFileRoute, redirect } from "@tanstack/react-router";

// Merged into a hub; kept so old links and bookmarks still work.
export const Route = createFileRoute("/credentials")({
  beforeLoad: () => { throw redirect({ to: "/techops/vault", replace: true }); },
});

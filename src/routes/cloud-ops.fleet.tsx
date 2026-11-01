import { createFileRoute, redirect } from "@tanstack/react-router";

// Fleet Control moved into the NOC Servers tab; kept so old links still work.
export const Route = createFileRoute("/cloud-ops/fleet")({
  beforeLoad: () => { throw redirect({ to: "/noc", search: { tab: "servers" }, replace: true }); },
});

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/portal")({
  head: () => ({ meta: [{ title: "Customer Portal — IMT" }] }),
  component: () => <Outlet />,
});

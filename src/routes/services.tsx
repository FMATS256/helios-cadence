import { createFileRoute } from "@tanstack/react-router";
import { ServicesLayout } from "@/components/services/marketing-shell";

export const Route = createFileRoute("/services")({
  component: ServicesLayout,
});

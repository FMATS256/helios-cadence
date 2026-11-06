import { createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeader } from "@/components/enterprise";
import { VendorLicensing } from "@/components/vendor-licensing";

export const Route = createFileRoute("/microsoft-365")({
  head: () => ({
    meta: [
      { title: "Microsoft 365 Licensing — IMT Operations" },
      { name: "description", content: "Provision Microsoft 365 tenants, new licences, renewals and seat changes with Finance approval." },
      { property: "og:title", content: "Microsoft 365 Licensing — IMT Operations" },
      { property: "og:description", content: "Microsoft 365 tenants, licences and renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Microsoft365Page,
});

function Microsoft365Page() {
  return (
    <PageShell>
      <SectionHeader eyebrow="Licensing" title="Microsoft 365" description="Tenants, new licences, renewals, upgrades and seat changes. Every order needs Finance approval." />
      <VendorLicensing vendor="microsoft365" />
    </PageShell>
  );
}

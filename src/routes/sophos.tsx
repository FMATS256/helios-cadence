import { createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeader } from "@/components/enterprise";
import { VendorLicensing } from "@/components/vendor-licensing";

export const Route = createFileRoute("/sophos")({
  head: () => ({
    meta: [
      { title: "Sophos Licensing — IMT Operations" },
      { name: "description", content: "Provision Sophos tenants, new licences, renewals and seat changes with Finance approval." },
      { property: "og:title", content: "Sophos Licensing — IMT Operations" },
      { property: "og:description", content: "Sophos tenants, licences and renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SophosPage,
});

function SophosPage() {
  return (
    <PageShell>
      <SectionHeader eyebrow="Licensing" title="Sophos" description="Tenants, new licences, renewals, upgrades and seat changes. Every order needs Finance approval." />
      <VendorLicensing vendor="sophos" />
    </PageShell>
  );
}

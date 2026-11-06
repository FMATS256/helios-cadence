import { createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeader } from "@/components/enterprise";
import { VendorLicensing } from "@/components/vendor-licensing";

export const Route = createFileRoute("/kaspersky")({
  head: () => ({
    meta: [
      { title: "Kaspersky Licensing — IMT Operations" },
      { name: "description", content: "Provision Kaspersky tenants, new licences, renewals and seat changes with Finance approval." },
      { property: "og:title", content: "Kaspersky Licensing — IMT Operations" },
      { property: "og:description", content: "Kaspersky tenants, licences and renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KasperskyPage,
});

function KasperskyPage() {
  return (
    <PageShell>
      <SectionHeader eyebrow="Licensing" title="Kaspersky" description="Tenants, new licences, renewals, upgrades and seat changes. Every order needs Finance approval." />
      <VendorLicensing vendor="kaspersky" />
    </PageShell>
  );
}

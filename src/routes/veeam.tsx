import { createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeader } from "@/components/enterprise";
import { VendorLicensing } from "@/components/vendor-licensing";

export const Route = createFileRoute("/veeam")({
  head: () => ({
    meta: [
      { title: "Veeam Licensing — IMT Operations" },
      { name: "description", content: "Provision Veeam tenants, new licences, renewals and seat changes with Finance approval." },
      { property: "og:title", content: "Veeam Licensing — IMT Operations" },
      { property: "og:description", content: "Veeam tenants, licences and renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VeeamPage,
});

function VeeamPage() {
  return (
    <PageShell>
      <SectionHeader eyebrow="Licensing" title="Veeam" description="Tenants, new licences, renewals, upgrades and seat changes. Every order needs Finance approval." />
      <VendorLicensing vendor="veeam" />
    </PageShell>
  );
}

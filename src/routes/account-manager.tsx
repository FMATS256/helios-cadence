import { createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeader } from "@/components/enterprise";
import { AccountPortfolio } from "@/components/account-portfolio";

export const Route = createFileRoute("/account-manager")({
  head: () => ({ meta: [
    { title: "Account Manager Hub | IMT Solutions" },
    { name: "description", content: "Assigned client portfolios, pending requests, renewals and technician dispatch at IMT Solutions." },
    { property: "og:title", content: "Account Manager Hub | IMT Solutions" },
    { property: "og:description", content: "Manage client accounts, requests and technical work orders." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AccountManagerPage,
});

function AccountManagerPage() {
  return <PageShell><SectionHeader eyebrow="Client operations" title="Account Manager" /><AccountPortfolio /></PageShell>;
}
import { createFileRoute } from "@tanstack/react-router";
import { ExpensesPage } from "@/components/workspaces/expenses-workspace";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses & Cash — IMT Operations Platform" },
      { name: "description", content: "Track operating expenses, petty cash in hand, bank balances and cash movements." },
      { property: "og:title", content: "Expenses & Cash — IMT Operations Platform" },
      { property: "og:description", content: "Operating expenses, cash in hand and bank balances in one workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

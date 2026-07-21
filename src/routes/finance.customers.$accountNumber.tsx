import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * DEPRECATED — this route redirects to the unified Customer 360 workspace.
 * The Customer 360 at /customers/$accountNumber is the single source of truth
 * for every customer view (finance, ops, support, sales). Deep links from the
 * Finance module land on the Transactions tab.
 */
export const Route = createFileRoute("/finance/customers/$accountNumber")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.accountNumber} — Customer 360` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceProfileRedirect,
});

function FinanceProfileRedirect() {
  const { accountNumber } = Route.useParams();
  return (
    <Navigate
      to="/customers/$accountNumber"
      params={{ accountNumber }}
      search={{ tab: "transactions" }}
      replace
    />
  );
}

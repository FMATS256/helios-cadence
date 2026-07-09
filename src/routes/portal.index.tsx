import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/hooks/use-portal";
import { Card, CardContent } from "@/components/ui/card";
import { LifeBuoy, Receipt, Server, Cloud } from "lucide-react";

export const Route = createFileRoute("/portal/")({
  head: () => ({ meta: [{ title: "Portal Overview — IMT" }] }),
  component: PortalHome,
});

function PortalHome() {
  const { customer } = usePortal();
  const cid = customer?.id;
  const { data: stats } = useQuery({
    queryKey: ["portal-stats", cid],
    enabled: !!cid,
    queryFn: async () => {
      const [tOpen, iOpen, assets, cloud] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("customer_id", cid).neq("status", "closed"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", cid).neq("status", "paid"),
        supabase.from("assets").select("id", { count: "exact", head: true }).eq("customer_id", cid),
        supabase.from("cloud_services").select("id", { count: "exact", head: true }).eq("customer_id", cid),
      ]);
      return {
        openTickets: tOpen.count ?? 0,
        openInvoices: iOpen.count ?? 0,
        assets: assets.count ?? 0,
        cloud: cloud.count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl p-8 text-navy-foreground relative overflow-hidden" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-40 blur-3xl" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative">
          <p className="text-xs uppercase tracking-[3px] text-solar font-semibold">Welcome</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-2">{customer?.company_name}</h1>
          <p className="mt-2 text-navy-foreground/70">Your services, tickets and invoices — always up to date.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat to="/portal/tickets" icon={LifeBuoy} label="Open tickets" value={stats?.openTickets ?? 0} tone="solar" />
        <Stat to="/portal/invoices" icon={Receipt} label="Open invoices" value={stats?.openInvoices ?? 0} tone="danger" />
        <Stat to="/portal/assets" icon={Server} label="Assets" value={stats?.assets ?? 0} tone="info" />
        <Stat to="/portal/assets" icon={Cloud} label="Cloud services" value={stats?.cloud ?? 0} tone="success" />
      </div>
    </div>
  );
}

function Stat({ to, icon: Icon, label, value, tone }: any) {
  const toneMap: any = {
    solar: "bg-solar/15 text-solar",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
  };
  return (
    <Link to={to}>
      <Card className="hover:-translate-y-0.5 transition-all hover:shadow-md">
        <CardContent className="p-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</p>
            <p className="font-display text-3xl font-bold mt-2 tabular-nums">{value}</p>
          </div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${toneMap[tone]}`}><Icon className="h-4 w-4" /></div>
        </CardContent>
      </Card>
    </Link>
  );
}

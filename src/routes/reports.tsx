import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Users, LifeBuoy, KeyRound, Cloud, Server, Receipt, Warehouse, Activity, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — IMT Operations" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: stats } = useQuery({
    queryKey: ["reports-stats"],
    queryFn: async () => {
      const [customers, tickets, credentials, cloud, assets, invoices, inventory, monitoring, projects] = await Promise.all([
        supabase.from("customers").select("id,status,archived_at").is("archived_at", null),
        supabase.from("tickets").select("id,status,priority"),
        supabase.from("credentials").select("id").is("archived_at", null),
        supabase.from("cloud_services" as any).select("id,monthly_cost,status").is("archived_at", null),
        supabase.from("assets" as any).select("id,status").is("archived_at", null),
        supabase.from("invoices" as any).select("id,status,total,currency"),
        supabase.from("inventory_items" as any).select("id,quantity,reorder_level").is("archived_at", null),
        supabase.from("monitoring_checks" as any).select("id,status,enabled").is("archived_at", null),
        supabase.from("projects" as any).select("id,status").is("archived_at", null),
      ]);
      return { customers, tickets, credentials, cloud, assets, invoices, inventory, monitoring, projects };
    },
  });

  const s = stats;
  const openTickets = (s?.tickets.data ?? []).filter((t: any) => t.status !== "resolved" && t.status !== "closed").length;
  const mrr = (s?.cloud.data ?? []).filter((c: any) => c.status === "active").reduce((n: number, c: any) => n + Number(c.monthly_cost || 0), 0);
  const unpaid = (s?.invoices.data ?? []).filter((i: any) => i.status !== "paid" && i.status !== "void").reduce((n: number, i: any) => n + Number(i.total || 0), 0);
  const lowStock = (s?.inventory.data ?? []).filter((i: any) => i.quantity <= i.reorder_level).length;
  const downChecks = (s?.monitoring.data ?? []).filter((c: any) => c.status === "down").length;
  const activeProjects = (s?.projects.data ?? []).filter((p: any) => p.status === "active").length;

  const cards = [
    { label: "Customers", value: s?.customers.data?.length ?? 0, icon: Users, tone: "info" as const },
    { label: "Open tickets", value: openTickets, icon: LifeBuoy, tone: openTickets > 0 ? "warning" as const : "success" as const },
    { label: "Credentials", value: s?.credentials.data?.length ?? 0, icon: KeyRound, tone: "info" as const },
    { label: "Cloud MRR", value: `$${mrr.toFixed(2)}`, icon: Cloud, tone: "success" as const },
    { label: "Assets", value: s?.assets.data?.length ?? 0, icon: Server, tone: "info" as const },
    { label: "Unpaid AR", value: `$${unpaid.toFixed(2)}`, icon: Receipt, tone: unpaid > 0 ? "warning" as const : "success" as const },
    { label: "Low stock", value: lowStock, icon: Warehouse, tone: lowStock > 0 ? "danger" as const : "success" as const },
    { label: "Monitors down", value: downChecks, icon: Activity, tone: downChecks > 0 ? "danger" as const : "success" as const },
    { label: "Active projects", value: activeProjects, icon: FolderKanban, tone: "info" as const },
  ];

  return (
    <PageContainer>
      <PageHeader eyebrow="Business" title="Reports" description="Cross-module operational summary." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{c.label}</p>
                <p className="font-display text-3xl font-bold mt-2">{c.value}</p>
                <div className="mt-3"><StatusPill tone={c.tone}>live</StatusPill></div>
              </div>
              <div className="rounded-lg bg-solar/10 p-2.5"><c.icon className="h-5 w-5 text-solar" /></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}

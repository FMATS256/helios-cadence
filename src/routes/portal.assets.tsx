import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/hooks/use-portal";
import { StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Server, Cloud } from "lucide-react";

export const Route = createFileRoute("/portal/assets")({
  head: () => ({ meta: [{ title: "My Assets — IMT Portal" }] }),
  component: PortalAssets,
});

function PortalAssets() {
  const { customer } = usePortal();
  const { data: assets = [] } = useQuery({
    queryKey: ["portal-assets", customer?.id],
    enabled: !!customer?.id,
    queryFn: async () => (await supabase.from("assets").select("*").eq("customer_id", customer!.id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: cloud = [] } = useQuery({
    queryKey: ["portal-cloud", customer?.id],
    enabled: !!customer?.id,
    queryFn: async () => (await supabase.from("cloud_services").select("*").eq("customer_id", customer!.id).order("service_name")).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">My assets & services</h1>
        <p className="text-sm text-muted-foreground mt-1">Everything IMT manages for you.</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Server className="h-4 w-4" /> Hardware</h2>
        <Card><CardContent className="p-0">
          {assets.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No hardware registered.</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Tag</TableHead><TableHead>Device</TableHead><TableHead>Serial</TableHead><TableHead>Assigned</TableHead><TableHead>Warranty</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {(assets as any[]).map((a) => {
                  const wDays = a.warranty_expires ? Math.floor((new Date(a.warranty_expires).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono">{a.asset_tag || "—"}</TableCell>
                      <TableCell>{a.make} {a.model}</TableCell>
                      <TableCell className="font-mono text-xs">{a.serial_number || "—"}</TableCell>
                      <TableCell>{a.assigned_to || "—"}</TableCell>
                      <TableCell><StatusPill tone={wDays == null ? "neutral" : wDays < 0 ? "danger" : wDays < 30 ? "warning" : "success"}>{wDays == null ? "n/a" : wDays < 0 ? "expired" : `${wDays}d`}</StatusPill></TableCell>
                      <TableCell><StatusPill tone={a.status === "in_service" ? "success" : "warning"}>{a.status.replace(/_/g, " ")}</StatusPill></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Cloud className="h-4 w-4" /> Cloud services</h2>
        <Card><CardContent className="p-0">
          {cloud.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No cloud services.</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Vendor</TableHead><TableHead>Plan</TableHead><TableHead>Seats</TableHead><TableHead>Renewal</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {(cloud as any[]).map((c) => {
                  const rDays = c.renewal_date ? Math.floor((new Date(c.renewal_date).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.service_name}</TableCell>
                      <TableCell>{c.vendor || "—"}</TableCell>
                      <TableCell>{c.plan || "—"}</TableCell>
                      <TableCell className="font-mono">{c.seats || "—"}</TableCell>
                      <TableCell><StatusPill tone={rDays == null ? "neutral" : rDays < 0 ? "danger" : rDays < 30 ? "warning" : "success"}>{rDays == null ? "n/a" : rDays < 0 ? "expired" : `${rDays}d`}</StatusPill></TableCell>
                      <TableCell><StatusPill tone={c.status === "active" ? "success" : "warning"}>{c.status}</StatusPill></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}

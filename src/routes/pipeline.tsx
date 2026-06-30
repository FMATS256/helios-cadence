import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline — RoyEno CRM" }, { name: "description", content: "Visual sales pipeline by stage." }] }),
  component: PipelinePage,
});

type Lead = { id: string; name: string; system_type: string | null; value: number; stage: string; };
const STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

function PipelinePage() {
  const qc = useQueryClient();
  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id,name,system_type,value,stage");
      if (error) throw error;
      return data as Lead[];
    },
  });

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Stage updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader eyebrow="Workspace" title="Sales Pipeline" description="Drag stages by changing the dropdown on each card. Totals update live." />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAGES.map((s) => {
          const stageLeads = leads.filter(l => l.stage === s);
          const total = stageLeads.reduce((sum, l) => sum + Number(l.value || 0), 0);
          return (
            <div key={s} className="bg-muted/40 rounded-xl p-3 min-h-[400px]">
              <div className="flex items-center justify-between mb-1"><span className="text-sm font-semibold">{s}</span><span className="text-xs text-muted-foreground">{stageLeads.length}</span></div>
              <p className="text-xs text-solar font-semibold mb-3">${total.toLocaleString()}</p>
              <div className="space-y-2">
                {stageLeads.map(l => (
                  <Card key={l.id}><CardContent className="p-3 space-y-2">
                    <p className="font-semibold text-sm truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{l.system_type ?? "—"}</p>
                    <p className="text-sm font-bold text-solar">${Number(l.value).toLocaleString()}</p>
                    <Select value={l.stage} onValueChange={(v) => move.mutate({ id: l.id, stage: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue/></SelectTrigger>
                      <SelectContent>{STAGES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                    </Select>
                  </CardContent></Card>
                ))}
                {stageLeads.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No leads</p>}
              </div>
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}

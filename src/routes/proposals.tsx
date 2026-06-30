import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { proposals } from "@/mock/data";
import { Plus, FileSignature } from "lucide-react";

export const Route = createFileRoute("/proposals")({
  head: () => ({ meta: [{ title: "Proposals — RoyEno CRM" }, { name: "description", content: "Solar proposals with full system designs and ROI." }] }),
  component: ProposalsPage,
});

const tone: Record<string, "neutral" | "info" | "warning" | "success"> = {
  Draft: "neutral", Sent: "info", "In Review": "warning", Accepted: "success",
};

function ProposalsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sales"
        title="Proposals"
        description="Engineered system designs with savings projections and finance options."
        actions={<Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New Proposal</Button>}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {proposals.map((p) => (
          <Card key={p.id} className="hover:shadow-[var(--shadow-elegant)] transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-solar/15 text-solar flex items-center justify-center"><FileSignature className="h-5 w-5" /></div>
                <StatusPill tone={tone[p.status]}>{p.status}</StatusPill>
              </div>
              <p className="text-xs font-mono text-muted-foreground mt-4">{p.id}</p>
              <h3 className="font-display font-semibold text-lg mt-1 leading-tight">{p.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.client}</p>
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground">{p.owner} · {p.date}</span>
                <span className="font-display text-xl font-bold text-solar">${p.amount.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}

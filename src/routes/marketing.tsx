import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { campaigns } from "@/mock/data";
import { Plus, Megaphone } from "lucide-react";

export const Route = createFileRoute("/marketing")({
  head: () => ({ meta: [{ title: "Marketing — RoyEno CRM" }, { name: "description", content: "Campaigns, lead sources, and outreach." }] }),
  component: () => (
    <PageContainer>
      <PageHeader eyebrow="Growth" title="Marketing" description="Campaigns across email, WhatsApp, social, and traditional channels."
        actions={<Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New Campaign</Button>} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campaigns.map((c) => (
          <Card key={c.id} className="hover:shadow-[var(--shadow-elegant)] transition-shadow"><CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Megaphone className="h-5 w-5" /></div>
              <StatusPill tone={c.status === "Running" ? "success" : c.status === "Paused" ? "warning" : "neutral"}>{c.status}</StatusPill>
            </div>
            <h3 className="font-display font-semibold text-lg mt-4">{c.name}</h3>
            <p className="text-sm text-muted-foreground">{c.channel}</p>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border">
              <div><p className="text-xs text-muted-foreground">Leads</p><p className="font-display font-bold text-lg">{c.leads}</p></div>
              <div><p className="text-xs text-muted-foreground">Conv.</p><p className="font-display font-bold text-lg text-success">{c.conversions}</p></div>
              <div><p className="text-xs text-muted-foreground">Spend</p><p className="font-display font-bold text-lg text-solar">${c.spend}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>
    </PageContainer>
  ),
});

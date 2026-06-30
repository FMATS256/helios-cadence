import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { documents } from "@/mock/data";
import { Upload, FileText, Download } from "lucide-react";

export const Route = createFileRoute("/documents")({
  head: () => ({ meta: [{ title: "Documents — RoyEno CRM" }, { name: "description", content: "Contracts, datasheets, warranties, and surveys." }] }),
  component: () => (
    <PageContainer>
      <PageHeader eyebrow="Operations" title="Documents" description="Centralized library of contracts, warranties, datasheets, and surveys."
        actions={<Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Upload className="h-4 w-4 mr-1.5" />Upload</Button>} />
      <Card><CardContent className="p-0">
        {documents.map((d) => (
          <div key={d.id} className="flex items-center gap-4 p-4 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
            <div className="h-10 w-10 rounded-lg bg-solar/15 text-solar flex items-center justify-center"><FileText className="h-5 w-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{d.name}</p>
              <p className="text-xs text-muted-foreground">{d.client} · {d.size} · {d.uploaded}</p>
            </div>
            <StatusPill tone="neutral">{d.type}</StatusPill>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
          </div>
        ))}
      </CardContent></Card>
    </PageContainer>
  ),
});

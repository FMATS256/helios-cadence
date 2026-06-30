import type { LucideIcon } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export function ComingSoon({ title, eyebrow, description, icon: Icon = Sparkles, features }: {
  title: string; eyebrow: string; description: string; icon?: LucideIcon; features: string[];
}) {
  return (
    <PageContainer>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Card><CardContent className="p-12 text-center max-w-2xl mx-auto">
        <div className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center text-solar-foreground mb-4" style={{ background: "var(--gradient-solar)" }}>
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="font-display text-2xl font-bold">Coming in Phase 2</h2>
        <p className="text-sm text-muted-foreground mt-2">
          The data model, navigation, and security for this module are in place. The full functional UI ships in the next phase.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
          {features.map((f) => (
            <div key={f} className="flex items-start gap-2 p-3 rounded-md bg-muted/40 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-solar mt-2" /> {f}
            </div>
          ))}
        </div>
      </CardContent></Card>
    </PageContainer>
  );
}

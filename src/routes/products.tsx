import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { products } from "@/mock/data";
import { Plus, Sun, Battery, Zap, Package2 } from "lucide-react";

export const Route = createFileRoute("/products")({
  head: () => ({ meta: [{ title: "Products & Systems — RoyEno CRM" }, { name: "description", content: "Solar panels, inverters, batteries, and complete kits catalog." }] }),
  component: ProductsPage,
});

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  Panel: Sun, Inverter: Zap, Battery: Battery, Kit: Package2,
};

const cats = ["All", "Panel", "Inverter", "Battery", "Kit"];

function ProductsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Operations"
        title="Products & Systems"
        description="Catalog of panels, inverters, batteries, and ready-to-deploy solar kits."
        actions={<Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />Add Product</Button>}
      />
      <Tabs defaultValue="All">
        <TabsList>{cats.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}</TabsList>
        {cats.map((c) => {
          const filtered = c === "All" ? products : products.filter((p) => p.category === c);
          return (
            <TabsContent key={c} value={c} className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((p) => {
                  const Icon = icons[p.category] || Package2;
                  return (
                    <Card key={p.id} className="hover:shadow-[var(--shadow-elegant)] transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                            <Icon className="h-6 w-6" />
                          </div>
                          <StatusPill tone={p.stock > 20 ? "success" : p.stock > 5 ? "warning" : "danger"}>
                            {p.stock} in stock
                          </StatusPill>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground mt-4">{p.id}</p>
                        <h3 className="font-display font-semibold text-lg mt-1">{p.name}</h3>
                        <p className="text-sm text-muted-foreground">{p.brand} · {p.category}</p>
                        <div className="flex items-end justify-between mt-4 pt-4 border-t border-border">
                          <div>
                            <p className="text-xs text-muted-foreground">Warranty</p>
                            <p className="text-xs font-medium">{p.warranty}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-xl font-bold text-solar">${p.price.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">{p.unit}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </PageContainer>
  );
}

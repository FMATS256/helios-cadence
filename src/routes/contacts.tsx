import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { contacts } from "@/mock/data";
import { Phone, Mail, Plus } from "lucide-react";

export const Route = createFileRoute("/contacts")({
  head: () => ({ meta: [{ title: "Contacts — RoyEno CRM" }, { name: "description", content: "Directory of client and vendor contacts." }] }),
  component: () => (
    <PageContainer>
      <PageHeader eyebrow="Sales" title="Contacts" description="People across all client accounts and partners."
        actions={<Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />Add Contact</Button>} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {contacts.map((c) => (
          <Card key={c.id} className="hover:shadow-md transition-shadow"><CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12"><AvatarFallback className="bg-navy/10 text-navy font-semibold">{c.name.split(" ").map((n: string) => n[0]).join("")}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">{c.role} · {c.company}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{c.phone}</p>
              <p className="flex items-center gap-2 text-muted-foreground truncate"><Mail className="h-3.5 w-3.5" />{c.email}</p>
            </div>
          </CardContent></Card>
        ))}
      </div>
    </PageContainer>
  ),
});

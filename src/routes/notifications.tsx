import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { notifications } from "@/mock/data";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — RoyEno CRM" }, { name: "description", content: "Activity and alerts." }] }),
  component: () => (
    <PageContainer>
      <PageHeader eyebrow="Workspace" title="Notifications" description="Real-time activity from leads, quotes, payments, and field operations." />
      <Card><CardContent className="p-0">
        {notifications.map((n) => (
          <div key={n.id} className={`flex items-start gap-4 p-4 border-b border-border last:border-0 ${n.unread ? "bg-solar/5" : ""}`}>
            <div className="h-10 w-10 rounded-lg bg-navy/10 text-navy flex items-center justify-center"><Bell className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">{n.title}</p>
                {n.unread && <span className="h-2 w-2 rounded-full bg-solar" />}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
              <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
            </div>
            <StatusPill tone="neutral">{n.type}</StatusPill>
          </div>
        ))}
      </CardContent></Card>
    </PageContainer>
  ),
});

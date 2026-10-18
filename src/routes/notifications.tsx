import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — IMT Operations" },
    { name: "description", content: "Your IMT account assignments and operational alerts." },
    { property: "og:title", content: "Notifications — IMT Operations" },
    { property: "og:description", content: "Your IMT account assignments and operational alerts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  // Realtime updates
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("notif-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const markRead = useMutation({
    mutationFn: async (id: string | null) => {
      const q: any = supabase.from("notifications").update({ read_at: new Date().toISOString() });
      const target = id ? q.eq("id", id) : q.is("read_at", null);
      await target;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = (rows as any[]).filter((n) => !n.read_at).length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="System"
        title="Notifications"
        description="Real-time alerts from across the platform."
        actions={unread > 0 ? <Button variant="outline" onClick={() => markRead.mutate(null)}><Check className="h-4 w-4 mr-1.5" />Mark all read ({unread})</Button> : null}
      />
      <Card><CardContent className="p-0">
        {rows.length === 0 && <div className="p-12 text-center"><Bell className="h-8 w-8 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No notifications yet.</p></div>}
        {(rows as any[]).map((n) => (
          <div key={n.id} className={`flex items-start gap-4 p-4 border-b border-border last:border-0 ${!n.read_at ? "bg-solar/5" : ""}`}>
            <div className="h-10 w-10 rounded-lg bg-navy/10 text-navy flex items-center justify-center"><Bell className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
              {n.kind === "account_assigned" && /^\/customers\/M\d+$/.test(n.link ?? "") && (
                <Button size="sm" variant="link" asChild>
                  <Link to="/customers/$accountNumber" params={{ accountNumber: n.link.split("/").pop() ?? "" }}>Open account</Link>
                </Button>
              )}
              <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>
            <StatusPill tone="neutral">{n.kind}</StatusPill>
            {!n.read_at && <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}><Check className="h-4 w-4" /></Button>}
          </div>
        ))}
      </CardContent></Card>
    </PageContainer>
  );
}

 from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchEmailLogs } from "@/lib/email-logs.functions";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, RefreshCw, Search } from "lucide-react";


const EVENT_VARIANT: Record<string, { label: string; className: string }> = {
  sent:         { label: "Sent",         className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  rejected:     { label: "Rejected",     className: "bg-red-500/15 text-red-500 border-red-500/30" },
  bounced:      { label: "Bounced",      className: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  complained:   { label: "Complaint",    className: "bg-pink-500/15 text-pink-500 border-pink-500/30" },
  unsubscribed: { label: "Unsubscribed", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  suppressed:   { label: "Suppressed",   className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  rate_limited: { label: "Rate limited", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
};

export function EmailLogsPage() {
  const { user, loading: authLoading } = useAuth();
  const { isMaster } = useRoles();
  const fetchLogs = useServerFn(fetchEmailLogs);

  const [recipient, setRecipient] = useState("");
  const [eventType, setEventType] = useState<string>("all");
  const [since, setSince] = useState<string>("");

  const enabled = !!user && isMaster;

  const query = useQuery({
    queryKey: ["email-logs", { recipient, eventType, since }],
    enabled,
    queryFn: () => fetchLogs({
      data: {
        recipient: recipient.trim() || undefined,
        event_type: eventType === "all" ? undefined : eventType,
        since: since ? new Date(since).toISOString() : undefined,
        limit: 100,
      },
    }),
  });

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-8 w-64" /></div>;
  }
  if (!user) {
    return <div className="p-6 text-sm text-muted-foreground">Please sign in to view email logs.</div>;
  }
  if (!isMaster) {
    return (
      <div className="p-6">
        <Card><CardHeader>
          <CardTitle>Restricted</CardTitle>
          <CardDescription>Email delivery logs are visible to master admins only.</CardDescription>
        </CardHeader></Card>
      </div>
    );
  }

  const events = query.data?.events ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Mail className="h-5 w-5 text-primary" />
            Email delivery log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Managed sends via Lovable Emails. Delivered / opened tracking is not recorded by the platform.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="recipient">Recipient</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)}
                  placeholder="name@example.com" className="pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                  <SelectItem value="complained">Complaint</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                  <SelectItem value="suppressed">Suppressed</SelectItem>
                  <SelectItem value="rate_limited">Rate limited</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="since">Since</Label>
              <Input id="since" type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => query.refetch()} disabled={query.isFetching}>
                Apply
              </Button>
            </div>
          </div>
          {query.data?.history_starts_at ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Retention window starts at{" "}
              {new Date(query.data.history_starts_at).toLocaleString()}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Events {query.data ? <span className="text-muted-foreground font-normal">({events.length})</span> : null}
          </CardTitle>
          <CardDescription>Most recent first. Up to 100 per query.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : query.isError ? (
            <div className="p-6 text-sm text-red-500">
              {(query.error as Error).message || "Failed to load email logs."}
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No email events in this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[140px]">Event</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="w-[180px]">Provider status</TableHead>
                    <TableHead className="w-[220px]">Message ID</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev, idx) => {
                    const variant = EVENT_VARIANT[ev.event_type] ?? {
                      label: ev.event_type,
                      className: "bg-muted text-muted-foreground border-border",
                    };
                    return (
                      <TableRow key={`${ev.message_id ?? "no-id"}-${ev.timestamp}-${idx}`}>
                        <TableCell className="font-mono text-xs">
                          {new Date(ev.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={variant.className}>{variant.label}</Badge>
                        </TableCell>
                        <TableCell className="truncate max-w-[240px]">{ev.recipient}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{ev.status ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[220px]">
                          {ev.message_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ev.tags && ev.tags.length > 0
                            ? ev.tags.map((t) => <Badge key={t} variant="secondary" className="mr-1">{t}</Badge>)
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

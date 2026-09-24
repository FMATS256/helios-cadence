import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAttachmentLink,
  getEnquiryThread,
  listEnquiries,
  listManagers,
  replyToEnquiry,
  assignEnquiry,
  setEnquiryStatus,
  type InboxScope,
} from "@/lib/inbox.functions";
import type { EnquiryListItem, InboxMessage } from "@/lib/inbox.shared";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Inbox as InboxIcon,
  Mail,
  Paperclip,
  Send,
  UserCog,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Email Inbox — IMT Operations" },
      { name: "description", content: "Customer enquiry inbox for account managers." },
      { property: "og:title", content: "Email Inbox — IMT Operations" },
      { property: "og:description", content: "Customer enquiry inbox for account managers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    enquiry: typeof search.enquiry === "string" ? search.enquiry : undefined,
  }),
  component: InboxPage,
});

const SCOPES: { key: InboxScope; label: string }[] = [
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "all", label: "All" },
];

function relativeTime(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "open") return "warning";
  if (status === "awaiting_customer") return "info" as any;
  return "neutral";
}

function statusLabel(status: string) {
  return status === "open" ? "Needs reply" : status === "awaiting_customer" ? "Awaiting customer" : "Closed";
}

function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function EnquiryCard({
  enquiry,
  active,
  onSelect,
}: {
  enquiry: EnquiryListItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
        active ? "border-solar bg-solar/10" : "border-border bg-card hover:border-solar/50 hover:bg-solar/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-solar">{enquiry.reference}</span>
        <StatusPill tone={statusTone(enquiry.status) as any}>{statusLabel(enquiry.status)}</StatusPill>
      </div>
      <div className="mt-1.5 font-semibold text-sm truncate">{enquiry.subject}</div>
      <div className="mt-1 text-xs text-muted-foreground truncate">
        {enquiry.contact_name ? `${enquiry.contact_name} · ` : ""}
        {enquiry.contact_email}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground truncate">
          {enquiry.customer_account_number ? (
            <Link
              to="/customers/$accountNumber"
              params={{ accountNumber: enquiry.customer_account_number }}
              className="font-mono hover:text-solar"
              onClick={(e) => e.stopPropagation()}
            >
              {enquiry.customer_account_number}
            </Link>
          ) : (
            "Walk-in"
          )}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground shrink-0">
          <Clock className="h-3 w-3" /> {relativeTime(enquiry.last_message_at)}
        </span>
      </div>
    </button>
  );
}

function MessageBubble({ message, onOpenAttachment }: { message: InboxMessage; onOpenAttachment: (m: InboxMessage, a: any) => void }) {
  const inbound = message.direction === "inbound";
  const body = message.body_text?.trim() || stripHtml(message.body_html);
  return (
    <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[92%] sm:max-w-[80%] rounded-xl border p-3.5 ${
          inbound ? "border-border bg-card" : "border-solar/30 bg-solar/10"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={`font-semibold ${inbound ? "text-info" : "text-solar"}`}>
            {inbound ? message.from_address : "You (IMT)"}
          </span>
          <span>to {inbound ? "Sales Team" : message.to_address}</span>
          <span>{new Date(message.created_at).toLocaleString("en-GB", { timeZone: "Africa/Harare" })}</span>
          {!inbound && (
            <StatusPill tone={message.delivery_status === "sent" || message.delivery_status === "delivered" ? "success" : message.delivery_status === "failed" ? "danger" : "neutral"}>
              {message.delivery_status === "failed" ? "Send failed" : message.delivery_status}
            </StatusPill>
          )}
        </div>
        {message.delivery_error && (
          <div className="mt-1 text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {message.delivery_error}
          </div>
        )}
        <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed break-words">{body || "(empty message)"}</div>
        {!!message.attachments?.length && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.attachments.map((a: any) => (
              <button
                key={a.id}
                onClick={() => onOpenAttachment(message, a)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-solar"
              >
                <Paperclip className="h-3 w-3" /> {a.filename}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enquiry: selectedId } = Route.useSearch();

  const [scope, setScope] = useState<InboxScope>("mine");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listEnquiriesFn = useServerFn(listEnquiries);
  const threadFn = useServerFn(getEnquiryThread);
  const managersFn = useServerFn(listManagers);
  const replyFn = useServerFn(replyToEnquiry);
  const assignFn = useServerFn(assignEnquiry);
  const statusFn = useServerFn(setEnquiryStatus);
  const attachmentFn = useServerFn(getAttachmentLink);

  const list = useQuery({
    queryKey: ["inbox", scope, status, search, user?.id],
    queryFn: () => listEnquiriesFn({ data: { scope, status, search } }),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const thread = useQuery({
    queryKey: ["inbox-thread", selectedId, user?.id],
    queryFn: () => threadFn({ data: { enquiryId: selectedId! } }),
    enabled: !!user && !!selectedId,
  });

  const managers = useQuery({
    queryKey: ["inbox-managers", user?.id],
    queryFn: () => managersFn(),
    enabled: !!user,
  });

  const enquiries = list.data?.enquiries ?? [];
  const canAssign = !!list.data?.canAssign;
  const active = thread.data?.enquiry ?? null;

  const filteredManagers = useMemo(() => managers.data ?? [], [managers.data]);

  const openEnquiry = (id: string) => navigate({ to: "/inbox", search: { enquiry: id } });

  async function openAttachment(messageId: string, attachmentId: string) {
    try {
      const res = await attachmentFn({ data: { messageId, attachmentId } });
      if (res.url) window.open(res.url, "_blank", "noopener");
      else setError(res.error ?? "Could not open attachment");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await replyFn({ data: { enquiryId: selectedId, body: reply.trim(), cc: cc.trim() ? cc.split(",").map((s) => s.trim()) : undefined } });
      setReply("");
      setCc("");
      setShowCc(false);
      await queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSending(false);
    }
  }

  async function changeAssignee(amId: string | null) {
    if (!selectedId) return;
    setError(null);
    try {
      await assignFn({ data: { enquiryId: selectedId, amId } });
      await queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  async function changeStatus(next: "open" | "awaiting_customer" | "closed") {
    if (!selectedId) return;
    setError(null);
    try {
      await statusFn({ data: { enquiryId: selectedId, status: next } });
      await queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sales · Customer Enquiries"
        title="Email Inbox"
        description="Every enquiry sent to sales@imtsolutions.co.zw lands here, acknowledged automatically, and stays threaded with the customer."
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden w-fit">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                scope === s.key ? "bg-solar text-background" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm capitalize"
        >
          <option value="all">All statuses</option>
          <option value="open">Needs reply</option>
          <option value="awaiting_customer">Awaiting customer</option>
          <option value="closed">Closed</option>
        </select>
        <Input
          placeholder="Search reference, subject, sender…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Enquiry list */}
        <div className={`${selectedId ? "hidden lg:flex" : "flex"} flex-col gap-2.5`}>
          {list.isLoading ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading enquiries…</div>
          ) : enquiries.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No enquiries here</p>
              <p className="mt-1 text-xs text-muted-foreground">
                New emails to sales@imtsolutions.co.zw appear automatically with a unique reference.
              </p>
            </div>
          ) : (
            enquiries.map((e) => (
              <EnquiryCard key={e.id} enquiry={e} active={e.id === selectedId} onSelect={() => openEnquiry(e.id)} />
            ))
          )}
        </div>

        {/* Conversation */}
        <div className={`${selectedId ? "flex" : "hidden lg:flex"} flex-col rounded-xl border border-border bg-card`}>
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
              Select an enquiry to read the conversation.
            </div>
          ) : thread.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading conversation…</div>
          ) : thread.isError || !active ? (
            <div className="p-6 text-sm text-destructive">Could not load this enquiry. It may have been reassigned.</div>
          ) : (
            <>
              <div className="border-b border-border p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      onClick={() => navigate({ to: "/inbox", search: { enquiry: undefined } })}
                      className="lg:hidden mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <ArrowLeft className="h-3 w-3" /> Back to inbox
                    </button>
                    <div className="font-mono text-xs font-bold text-solar">{active.reference}</div>
                    <div className="font-display text-lg font-bold truncate">{active.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {active.contact_name ? `${active.contact_name} · ` : ""}
                      {active.contact_email}
                      {active.customer_account_number && (
                        <>
                          {" · "}
                          <Link
                            to="/customers/$accountNumber"
                            params={{ accountNumber: active.customer_account_number }}
                            className="font-mono hover:text-solar"
                          >
                            {active.customer_account_number}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <StatusPill tone={statusTone(active.status) as any}>{statusLabel(active.status)}</StatusPill>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {canAssign && (
                    <div className="flex items-center gap-1.5">
                      <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
                      <select
                        value={active.assigned_am_id ?? ""}
                        onChange={(e) => changeAssignee(e.target.value || null)}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {filteredManagers.map((m: any) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name} ({m.role_label})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {!canAssign && (
                    <span className="text-xs text-muted-foreground">
                      Account Manager: {active.am_name ?? "Unassigned"}
                    </span>
                  )}
                  {active.status !== "closed" ? (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => changeStatus("closed")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Close
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => changeStatus("open")}>
                      Reopen
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[52vh] min-h-[200px]">
                {thread.data?.messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onOpenAttachment={(msg, a) => openAttachment(msg.id, a.id)}
                  />
                ))}
              </div>

              {active.status !== "closed" && (
                <div className="border-t border-border p-4 space-y-2">
                  <Label htmlFor="inbox-reply">Reply to customer</Label>
                  <Textarea
                    id="inbox-reply"
                    rows={4}
                    placeholder="Type your reply — it is sent from your own @imtsolutions.co.zw address and stays on this enquiry."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {showCc ? (
                      <Input
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="CC addresses, comma separated"
                        className="h-9 max-w-xs text-xs"
                      />
                    ) : (
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCc(true)}>
                        + Add CC
                      </button>
                    )}
                    <Button onClick={sendReply} disabled={sending || !reply.trim()} className="gap-2">
                      <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Customer replies return to this thread automatically.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

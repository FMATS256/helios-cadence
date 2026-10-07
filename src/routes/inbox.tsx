import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  getAttachmentLink,
  getEnquiryThread,
  listEnquiries,
  listManagers,
  replyToEnquiry,
  assignEnquiry,
  setEnquiryStatus,
  composeEnquiryEmail,
  listInboxQuotes,
  archiveEnquiry,
  type InboxScope,
} from "@/lib/inbox.functions";
import type { EnquiryListItem, InboxMessage } from "@/lib/inbox.shared";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Folder,
  Forward,
  Inbox as InboxIcon,
  Mail,
  MailPlus,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  UserCog,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type QuoteOption = { id: string; quote_number: string | null; title: string | null; amount: number | null; currency: string | null; status: string | null };
const quoteLabel = (q: QuoteOption) =>
  `${q.quote_number || "Draft"} · ${q.title || "Quotation"} · ${q.currency || "USD"} ${Number(q.amount ?? 0).toFixed(2)}`;

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
    quote: typeof search.quote === "string" ? search.quote : undefined,
  }),
  component: InboxPage,
});

const SCOPES: { key: InboxScope; label: string; icon: typeof InboxIcon }[] = [
  { key: "mine", label: "Inbox", icon: InboxIcon },
  { key: "unassigned", label: "Unassigned", icon: Users },
  { key: "all", label: "All enquiries", icon: Mail },
];

const STATUS_ITEMS = [
  { key: "awaiting_customer", label: "Awaiting customer", icon: Clock3 },
  { key: "closed", label: "Closed", icon: CheckCircle2 },
] as const;

function relativeTime(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function statusLabel(status: string) {
  return status === "open" ? "Needs reply" : status === "awaiting_customer" ? "Awaiting customer" : "Closed";
}

function statusClass(status: string) {
  if (status === "open") return "bg-warning text-primary";
  if (status === "awaiting_customer") return "bg-info/15 text-info";
  return "bg-muted text-muted-foreground";
}

function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function initials(name?: string | null, email?: string) {
  const source = name?.trim() || email?.split("@")[0] || "Customer";
  return source
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function EnquiryRow({
  enquiry,
  active,
  onSelect,
}: {
  enquiry: EnquiryListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const sender = enquiry.contact_name || enquiry.contact_email;
  return (
    <Button
      variant="ghost"
      onClick={onSelect}
      className={`relative h-auto w-full justify-start rounded-none border-b border-border px-4 py-2.5 text-left transition-colors ${
        active ? "bg-accent hover:bg-accent" : "bg-card hover:bg-muted/60"
      }`}
    >
      {active || enquiry.status === "open" ? <span className="absolute inset-y-0 left-0 w-1 bg-solar" /> : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className={`truncate text-sm ${enquiry.status === "open" ? "font-bold text-foreground" : "font-semibold"}`}>
            {sender}
          </span>
          <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{relativeTime(enquiry.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-xs ${enquiry.status === "open" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{enquiry.subject}</span>
          {enquiry.message_count > 1 ? <span className="shrink-0 text-[11px] text-muted-foreground">{enquiry.message_count}</span> : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-normal text-muted-foreground">
            {enquiry.reference} · {enquiry.customer_account_number ?? "Walk-in enquiry"}
          </span>
          <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(enquiry.status)}`}>
            {statusLabel(enquiry.status)}
          </span>
        </div>
      </div>
    </Button>
  );
}

function MessagePanel({
  message,
  onOpenAttachment,
}: {
  message: InboxMessage;
  onOpenAttachment: (m: InboxMessage, a: InboxMessage["attachments"][number]) => void;
}) {
  const inbound = message.direction === "inbound";
  const body = message.body_text?.trim() || stripHtml(message.body_html);
  const sender = inbound ? message.from_address : "IMT Solutions";

  return (
    <article className="border-b border-border bg-card px-4 py-5 sm:px-7">
      <div className="flex gap-3">
        <Avatar className={`h-9 w-9 shrink-0 border ${inbound ? "border-info/30" : "border-solar/40"}`}>
          <AvatarFallback className={inbound ? "bg-info/15 text-info" : "bg-solar/15 text-solar"}>
            {initials(sender)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{sender}</p>
              <p className="truncate text-xs text-muted-foreground">
                To: {inbound ? "sales@imtsolutions.co.zw" : message.to_address}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="hidden sm:inline">
                {new Date(message.created_at).toLocaleString("en-GB", {
                  timeZone: "Africa/Harare",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="sm:hidden">{relativeTime(message.created_at)}</span>
            </div>
          </div>
          {!inbound ? (
            <p className={`mt-1 text-[11px] font-medium ${message.delivery_status === "failed" ? "text-destructive" : "text-success"}`}>
              {message.delivery_status === "failed" ? "Send failed" : message.delivery_status}
            </p>
          ) : null}
          {message.delivery_error ? (
            <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" /> {message.delivery_error}
            </div>
          ) : null}
          <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{body || "(empty message)"}</div>
          {message.attachments?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <Button
                  key={attachment.id}
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenAttachment(message, attachment)}
                  className="h-8 rounded-sm text-xs"
                >
                  <Paperclip className="h-3.5 w-3.5" /> {attachment.filename}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function InboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enquiry: selectedId, quote: quoteParam } = Route.useSearch();
  const [folder, setFolder] = useState<"inbox" | "sent" | "archive">("inbox");
  const [quoteId, setQuoteId] = useState("");
  const [composeOpen, setComposeOpen] = useState(!!quoteParam);
  const [compose, setCompose] = useState({ to: "", cc: "", subject: "", body: "", quoteId: quoteParam ?? "" });
  const [composing, setComposing] = useState(false);
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
  const composeFn = useServerFn(composeEnquiryEmail);
  const quotesFn = useServerFn(listInboxQuotes);
  const archiveFn = useServerFn(archiveEnquiry);

  const list = useQuery({
    queryKey: ["inbox", scope, status, search, folder, user?.id],
    queryFn: () => listEnquiriesFn({ data: { scope, status, search, folder } }),
    enabled: !!user,
    refetchInterval: 30000,
  });
  const thread = useQuery({
    queryKey: ["inbox-thread", selectedId, user?.id],
    queryFn: () => {
      if (!selectedId) throw new Error("No enquiry selected");
      return threadFn({ data: { enquiryId: selectedId } });
    },
    enabled: !!user && !!selectedId,
  });
  const managers = useQuery({
    queryKey: ["inbox-managers", user?.id],
    queryFn: () => managersFn(),
    enabled: !!user,
  });

  const threadQuotes = useQuery({
    queryKey: ["inbox-quotes", selectedId, user?.id],
    queryFn: () => quotesFn({ data: { enquiryId: selectedId } }),
    enabled: !!user && !!selectedId,
  });
  const allQuotes = useQuery({
    queryKey: ["inbox-quotes-all", user?.id],
    queryFn: () => quotesFn({ data: {} }),
    enabled: !!user && composeOpen,
  });

  async function sendCompose() {
    if (!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()) {
      toast.error("To, subject and message are required");
      return;
    }
    setComposing(true);
    try {
      const res = await composeFn({
        data: {
          to: compose.to.trim(),
          subject: compose.subject.trim(),
          body: compose.body.trim(),
          cc: compose.cc.trim() ? compose.cc.split(",").map((a) => a.trim()) : undefined,
          quoteId: compose.quoteId || null,
        },
      });
      toast.success(compose.quoteId ? "Email sent with quotation attached" : "Email sent");
      setComposeOpen(false);
      setCompose({ to: "", cc: "", subject: "", body: "", quoteId: "" });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      if (res.enquiryId) void navigate({ to: "/inbox", search: { enquiry: res.enquiryId, quote: undefined } });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setComposing(false);
    }
  }

  async function toggleArchive() {
    if (!selectedId) return;
    try {
      await archiveFn({ data: { enquiryId: selectedId, archived: folder !== "archive" } });
      toast.success(folder === "archive" ? "Moved back to inbox" : "Archived");
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
      navigate({ to: "/inbox", search: { enquiry: undefined, quote: undefined } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function forwardActive() {
    const t = thread.data;
    if (!t) return;
    const last = t.messages[t.messages.length - 1];
    setCompose({
      to: "",
      cc: "",
      subject: `Fwd: ${t.enquiry.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${last?.from_address ?? ""}\nSubject: ${t.enquiry.subject}\n\n${last?.body_text ?? stripHtml(last?.body_html)}`,
      quoteId: "",
    });
    setComposeOpen(true);
  }

  const enquiries = list.data?.enquiries ?? [];
  const canAssign = !!list.data?.canAssign;
  const active = thread.data?.enquiry ?? null;
  const filteredManagers = useMemo(() => managers.data ?? [], [managers.data]);
  const openEnquiry = (id: string) => navigate({ to: "/inbox", search: { enquiry: id, quote: undefined } });

  async function openAttachment(messageId: string, attachmentId: string) {
    try {
      const res = await attachmentFn({ data: { messageId, attachmentId } });
      if (res.url) window.open(res.url, "_blank", "noopener");
      else setError(res.error ?? "Could not open attachment");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await replyFn({
        data: {
          enquiryId: selectedId,
          body: reply.trim(),
          cc: cc.trim() ? cc.split(",").map((address) => address.trim()) : undefined,
          quoteId: quoteId || null,
        },
      });
      toast.success(quoteId ? "Reply sent with quotation attached" : "Reply sent");
      setReply("");
      setQuoteId("");
      setCc("");
      setShowCc(false);
      void queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function changeStatus(next: "open" | "awaiting_customer" | "closed") {
    if (!selectedId) return;
    setError(null);
    try {
      await statusFn({ data: { enquiryId: selectedId, status: next } });
      await queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[560px] overflow-hidden bg-card">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-muted/35 xl:flex">
        <div className="border-b border-border p-3">
          <Button onClick={() => setComposeOpen(true)} className="h-10 w-full justify-start rounded-sm bg-solar text-solar-foreground hover:bg-solar/90">
            <MailPlus className="h-4 w-4" /> New mail
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <div className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold">
            <ChevronDown className="h-3.5 w-3.5" /> sales@imtsolutions.co.zw
          </div>
          <nav aria-label="Mailbox folders" className="space-y-0.5">
            {SCOPES.map((item) => (
              <Button
                key={item.key}
                variant="ghost"
                onClick={() => {
                  setScope(item.key);
                  setStatus("all");
                  setFolder("inbox");
                }}
                className={`h-9 w-full justify-start rounded-sm px-3 text-sm ${
                  scope === item.key && status === "all" && folder === "inbox" ? "bg-solar/15 font-semibold text-solar hover:bg-solar/15" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.key === "mine" && enquiries.length ? (
                  <span className="ml-auto text-xs font-semibold text-solar">{enquiries.length}</span>
                ) : null}
              </Button>
            ))}
            {STATUS_ITEMS.map((item) => (
              <Button
                key={item.key}
                variant="ghost"
                onClick={() => setStatus(item.key)}
                className={`h-9 w-full justify-start rounded-sm px-3 text-sm ${
                  status === item.key ? "bg-solar/15 font-semibold text-solar hover:bg-solar/15" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </Button>
            ))}
          </nav>
          <div className="mt-5 mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
            <ChevronDown className="h-3 w-3" /> Folders
          </div>
          <div className="space-y-0.5">
            {([{ key: "sent", label: "Sent", icon: Send }, { key: "archive", label: "Archive", icon: Archive }] as const).map((item) => (
              <Button
                key={item.key}
                variant="ghost"
                onClick={() => { setFolder(item.key); setScope("all"); setStatus("all"); }}
                className={`h-8 w-full justify-start rounded-sm px-3 text-sm ${folder === item.key ? "bg-solar/15 font-semibold text-solar hover:bg-solar/15" : "text-muted-foreground"}`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </Button>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 px-3 text-sm text-muted-foreground">
            <Folder className="h-4 w-4" /> Customer Enquiries
          </div>
        </div>
      </aside>

      <section className={`${selectedId ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-border bg-card lg:w-[350px] xl:w-[370px]`}>
        <div className="border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="font-display text-xl font-semibold">{folder === "sent" ? "Sent" : folder === "archive" ? "Archive" : "Inbox"}</h1>
              <p className="text-xs text-muted-foreground">Customer enquiries</p>
            </div>
            <Button size="sm" onClick={() => setComposeOpen(true)} className="ml-auto h-8 rounded-sm bg-solar text-solar-foreground hover:bg-solar/90 xl:hidden">
              <MailPlus className="h-4 w-4" /> New
            </Button>
            <Button variant="ghost" size="icon" onClick={() => list.refetch()} title="Refresh inbox">
              <RefreshCw className={`h-4 w-4 ${list.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search email"
              placeholder="Search mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 rounded-sm bg-muted/60 pl-9"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1 xl:hidden">
              {SCOPES.map((item) => (
                <Button
                  key={item.key}
                  variant={scope === item.key ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setScope(item.key)}
                  className="h-7 rounded-sm px-2 text-xs"
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="ml-auto h-7 border-0 bg-transparent text-xs font-medium text-muted-foreground outline-none"
            >
              <option value="all">All statuses</option>
              <option value="open">Needs reply</option>
              <option value="awaiting_customer">Awaiting customer</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 border-b border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {list.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading messages…</div>
          ) : enquiries.length === 0 ? (
            <div className="px-8 py-14 text-center">
              <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">Your inbox is clear</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">New customer emails appear here automatically.</p>
            </div>
          ) : (
            enquiries.map((item) => (
              <EnquiryRow key={item.id} enquiry={item} active={item.id === selectedId} onSelect={() => openEnquiry(item.id)} />
            ))
          )}
        </div>
      </section>

      <section className={`${selectedId ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col bg-background`}>
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-solar/10 text-solar">
              <Mail className="h-8 w-8" />
            </div>
            <p className="mt-4 text-base font-semibold">Select a message to read</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose a customer enquiry from the list.</p>
          </div>
        ) : thread.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading conversation…</div>
        ) : thread.isError || !active ? (
          <div className="p-6 text-sm text-destructive">This enquiry is unavailable or has been reassigned.</div>
        ) : (
          <>
            <div className="flex min-h-12 items-center gap-1 border-b border-border bg-card px-2 sm:px-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate({ to: "/inbox", search: { enquiry: undefined, quote: undefined } })}
                className="lg:hidden"
                title="Back to inbox"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => changeStatus("awaiting_customer")} className="rounded-sm">
                <Reply className="h-4 w-4" /> <span className="hidden sm:inline">Reply</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={forwardActive} className="rounded-sm">
                <Forward className="h-4 w-4" /> <span className="hidden sm:inline">Forward</span>
              </Button>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button variant="ghost" size="icon" onClick={toggleArchive} className="rounded-sm" title={folder === "archive" ? "Move to inbox" : "Archive"}>
                <Archive className="h-4 w-4" />
              </Button>
              {active.status !== "closed" ? (
                <Button variant="ghost" size="sm" onClick={() => changeStatus("closed")} className="rounded-sm">
                  <CheckCircle2 className="h-4 w-4" /> <span className="hidden sm:inline">Close</span>
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => changeStatus("open")} className="rounded-sm">Reopen</Button>
              )}
              <Button variant="ghost" size="icon" className="ml-auto rounded-sm" title="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-semibold text-solar">{active.reference}</div>
                  <h2 className="truncate font-display text-xl font-semibold text-foreground">{active.subject}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{active.contact_name || active.contact_email}</span>
                    <span>·</span>
                    <span>{thread.data?.messages.length ?? 0} messages</span>
                    {active.customer_account_number ? (
                      <>
                        <span>·</span>
                        <Link
                          to="/customers/$accountNumber"
                          params={{ accountNumber: active.customer_account_number }}
                          className="font-mono font-semibold text-solar hover:underline"
                        >
                          {active.customer_account_number}
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
                <span className={`shrink-0 px-2 py-1 text-xs font-semibold ${statusClass(active.status)}`}>
                  {statusLabel(active.status)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canAssign ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserCog className="h-3.5 w-3.5" />
                    <select
                      aria-label="Assigned account manager"
                      value={active.assigned_am_id ?? ""}
                      onChange={(event) => changeAssignee(event.target.value || null)}
                      className="h-7 border border-border bg-background px-2 text-xs text-foreground outline-none"
                    >
                      <option value="">Unassigned</option>
                      {filteredManagers.map((manager: { id: string; full_name: string; role_label: string }) => (
                        <option key={manager.id} value={manager.id}>{manager.full_name} ({manager.role_label})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Account Manager: {active.am_name ?? "Unassigned"}</span>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {(thread.data?.messages ?? []).map((message) => (
                <MessagePanel
                  key={message.id}
                  message={message}
                  onOpenAttachment={(mail, attachment) => openAttachment(mail.id, attachment.id)}
                />
              ))}
            </div>

            {active.status !== "closed" ? (
              <div className="border-t border-border bg-card p-3 sm:p-4">
                {showCc ? (
                  <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                    <span className="text-xs text-muted-foreground">Cc</span>
                    <Input
                      aria-label="CC recipients"
                      value={cc}
                      onChange={(event) => setCc(event.target.value)}
                      placeholder="Email addresses, separated by commas"
                      className="h-7 flex-1 border-0 px-0 text-xs shadow-none focus-visible:ring-0"
                    />
                  </div>
                ) : null}
                <Textarea
                  aria-label="Reply to customer"
                  rows={3}
                  placeholder={`Reply to ${active.contact_name || active.contact_email}`}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  className="min-h-20 resize-none rounded-sm border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                />
                <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
                  <Button onClick={sendReply} disabled={sending || !reply.trim()} className="h-8 rounded-sm bg-solar px-4 text-solar-foreground hover:bg-solar/90">
                    <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowCc((visible) => !visible)} className="h-8 rounded-sm text-xs">
                    Cc
                  </Button>
                  <div className="flex min-w-0 items-center gap-1">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <select
                      aria-label="Attach quotation"
                      value={quoteId}
                      onChange={(event) => setQuoteId(event.target.value)}
                      className="h-8 max-w-[170px] truncate border border-border bg-background px-1 text-xs outline-none sm:max-w-[260px]"
                    >
                      <option value="">{threadQuotes.data?.length ? "Attach quotation…" : "No quotations for this client"}</option>
                      {((threadQuotes.data ?? []) as QuoteOption[]).map((q) => (
                        <option key={q.id} value={q.id}>{quoteLabel(q)}</option>
                      ))}
                    </select>
                  </div>
                  <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                    <Mail className="h-3 w-3" /> Replies stay in this enquiry
                  </span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New message</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input aria-label="To" placeholder="To (client email)" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
            <Input aria-label="Cc" placeholder="Cc (optional, comma separated)" value={compose.cc} onChange={(e) => setCompose({ ...compose, cc: e.target.value })} />
            <Input aria-label="Subject" placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
            <Textarea aria-label="Message" rows={8} placeholder="Write your message…" value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <select
                aria-label="Attach quotation"
                value={compose.quoteId}
                onChange={(e) => setCompose({ ...compose, quoteId: e.target.value })}
                className="h-9 flex-1 border border-border bg-background px-2 text-sm outline-none"
              >
                <option value="">No quotation attached</option>
                {((allQuotes.data ?? []) as QuoteOption[]).map((q) => (
                  <option key={q.id} value={q.id}>{quoteLabel(q)}</option>
                ))}
              </select>
            </div>
            {compose.quoteId ? (
              <p className="flex items-center gap-1.5 text-xs text-solar"><FileText className="h-3.5 w-3.5" /> The quotation PDF will be attached and kept on the conversation.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Discard</Button>
            <Button onClick={sendCompose} disabled={composing} className="bg-solar text-solar-foreground hover:bg-solar/90">
              <Send className="h-4 w-4" /> {composing ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
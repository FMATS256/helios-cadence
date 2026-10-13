import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmailHtmlView } from "@/components/email-html-view";
import { EmailAttachment } from "@/components/email-attachment";
import { EmailComposer, type ComposerFile, type ComposerHandle } from "@/components/email-composer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  getEmailWorkspace, saveEmailWorkspace, emailInternalNotes,
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
  retryFailedMessage,
  type InboxScope,
} from "@/lib/inbox.functions";
import type { EmailDraft, EmailOrganization, EnquiryListItem, InboxMessage } from "@/lib/inbox.shared";
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
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  UserCog,
  Users, Flag, Pin, Tag, StickyNote, Settings2, Save, Trash2,
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
  organization,
}: {
  enquiry: EnquiryListItem;
  active: boolean;
  onSelect: () => void;
  organization?: EmailOrganization;
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
            {organization?.pinned ? <Pin className="mr-1 inline h-3 w-3 text-solar" /> : null}{sender}
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
        <div className="flex flex-wrap gap-1 pt-1">
          {enquiry.replied_by ? <span className="max-w-full truncate rounded-sm bg-teal/15 px-1.5 py-0.5 text-[10px] font-medium text-teal">Replied by {enquiry.replied_by}</span> : null}
          {organization?.flagged ? <Flag className="h-3 w-3 text-amber" /> : null}
          {organization?.unread ? <Mail className="h-3 w-3 text-solar" /> : null}
          {organization?.category ? <span className={`rounded-sm px-1.5 text-[10px] ${organization.category === "Urgent" ? "bg-destructive/10 text-destructive" : organization.category === "Finance" ? "bg-success/15 text-success" : "bg-violet/15 text-violet"}`}>{organization.category}</span> : null}
        </div>
      </div>
    </Button>
  );
}

function MessagePanel({
  message,
  onOpenAttachment,
  onRetry,
}: {
  message: InboxMessage;
  onOpenAttachment: (m: InboxMessage, a: InboxMessage["attachments"][number]) => void;
  onRetry?: (messageId: string) => void;
}) {
  const inbound = message.direction === "inbound";
  const body = message.body_text?.trim() || stripHtml(message.body_html);
  const sender = message.sender_name || message.from_address;

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
                To: {message.to_address}
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
          {message.cc_address ? <p className="mt-1 break-all text-xs text-muted-foreground">Cc: {message.cc_address}</p> : null}
          {!inbound && message.sender_name && message.delivery_status === "sent" ? <span className="mt-1 inline-block rounded-sm bg-teal/15 px-2 py-0.5 text-[10px] font-medium text-teal">Replied by {message.sender_name}</span> : null}
          {!inbound ? (
            <p className={`mt-1 flex items-center gap-2 text-[11px] font-medium ${message.delivery_status === "failed" ? "text-destructive" : "text-success"}`}>
              {message.delivery_status === "failed" ? "Send failed" : message.delivery_status}
              {message.delivery_status === "failed" && onRetry ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 rounded-sm px-2 text-[11px]"
                  onClick={() => onRetry(message.id)}
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </Button>
              ) : null}
            </p>
          ) : null}
          {message.delivery_error ? (
            <details className="mt-2 text-xs text-destructive">
              <summary className="cursor-pointer">{message.delivery_error.startsWith("Gateway 500") ? "Email service error (500) — details" : "Delivery error — details"}</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-sans">{message.delivery_error}</pre>
            </details>
          ) : null}
          <div className="mt-4">{message.body_html ? <EmailHtmlView html={message.body_html} title={`Email from ${sender}`} /> : <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{body || "(empty message)"}</div>}</div>
          {message.attachments?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => <EmailAttachment key={attachment.id} messageId={message.id} attachment={attachment} />)}
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
  const [folder, setFolder] = useState<"inbox" | "sent" | "archive" | "drafts" | "flagged">("inbox");
  const [mailbox, setMailbox] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [note, setNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [draftState, setDraftState] = useState("Saved");
  const [composeHtml, setComposeHtml] = useState("");
  const [replyHtmlDraft, setReplyHtmlDraft] = useState("");
  const [draftKey, setDraftKey] = useState("new");
  const [draftsReady, setDraftsReady] = useState(false);
  const composeRestored = useRef(false);
  const sendingRef = useRef(false);
  const restoredReply = useRef<string | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [composeOpen, setComposeOpen] = useState(!!quoteParam);
  const [compose, setCompose] = useState({ to: "", cc: "", subject: "", body: "", quoteId: quoteParam ?? "" });
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [scope, setScope] = useState<InboxScope>("mine");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [replyExpanded, setReplyExpanded] = useState(false);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replyInput = useRef<ComposerHandle>(null);
  const composeEditor = useRef<ComposerHandle>(null);
  const [bcc, setBcc] = useState("");
  const [replyFiles, setReplyFiles] = useState<ComposerFile[]>([]);
  const [composeFiles, setComposeFiles] = useState<ComposerFile[]>([]);
  const [composeBcc, setComposeBcc] = useState("");
  const [showComposeBcc, setShowComposeBcc] = useState(false);
  const splitAddrs = (v: string) => (v.trim() ? v.split(/[,;]/).map((a) => a.trim()).filter(Boolean) : undefined);
  const toFilePayload = (list: ComposerFile[]) => (list.length ? list.map(({ filename, contentType, base64 }) => ({ filename, contentType, base64 })) : undefined);
  useEffect(() => {
    if (!composeOpen) return;
    const seed = compose.body;
    const t = window.setTimeout(() => {
      if (!seed) return;
      const esc = seed.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
      composeEditor.current?.setHtml(esc.split(/\n/).map((l) => (l ? `<p>${l}</p>` : "<p><br/></p>")).join(""));
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen]);

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
  const retryFn = useServerFn(retryFailedMessage);
  const workspaceFn = useServerFn(getEmailWorkspace);
  const saveWorkspaceFn = useServerFn(saveEmailWorkspace);
  const notesFn = useServerFn(emailInternalNotes);
  const thread = useQuery({
    queryKey: ["inbox-thread", selectedId, user?.id],
    queryFn: () => {
      if (!selectedId) throw new Error("No enquiry selected");
      return threadFn({ data: { enquiryId: selectedId } });
    },
    enabled: !!user && !!selectedId,
  });
  const workspace = useQuery({ queryKey: ["email-workspace", user?.id], queryFn: () => workspaceFn(), enabled: !!user });
  const notes = useQuery({ queryKey: ["email-notes", selectedId], queryFn: () => { if (!selectedId) throw new Error("No enquiry"); return notesFn({ data: { enquiryId: selectedId } }); }, enabled: !!selectedId && showNotes });
  const organization = workspace.data?.organization ?? {};
  useEffect(() => { if (workspace.data && !mailbox) { const address = workspace.data.departments[0]?.addresses[0] ?? ""; setMailbox(address); if (address && address !== "sales@imtsolutions.co.zw") setScope("all"); } }, [workspace.data, mailbox]);
  useEffect(() => {
    if (!workspace.data || composeRestored.current) return;
    composeRestored.current = true;
    const draft = workspace.data.drafts.new;
    if (draft && !quoteParam) { setCompose({ to: draft.to ?? "", cc: draft.cc ?? "", subject: draft.subject ?? "", body: "", quoteId: draft.quoteId ?? "" }); setComposeHtml(draft.html); setComposeFiles(draft.files ?? []); setComposeBcc(draft.bcc ?? ""); }
    setDraftsReady(true);
  }, [workspace.data, quoteParam]);
  useEffect(() => {
    if (!composeOpen || !composeHtml) return;
    const timer = window.setTimeout(() => composeEditor.current?.setHtml(composeHtml), 50);
    return () => window.clearTimeout(timer);
  }, [composeOpen, draftKey]);
  useEffect(() => {
    if (!workspace.data || !selectedId || restoredReply.current === selectedId || !thread.data) return;
    restoredReply.current = selectedId;
    const draft = workspace.data.drafts[`reply:${selectedId}`];
    const html = draft?.html ?? "";
    setReplyHtmlDraft(html); setReplyFiles(draft?.files ?? []); setCc(draft?.cc ?? ""); setBcc(draft?.bcc ?? ""); setQuoteId(draft?.quoteId ?? "");
    const timer = window.setTimeout(() => { replyInput.current?.setHtml(html); }, 50);
    return () => window.clearTimeout(timer);
  }, [workspace.data, selectedId, thread.data]);
  useEffect(() => {
    if (!draftsReady || !composeOpen || sendingRef.current || (!composeHtml && !compose.to && !compose.subject)) return;
    setDraftState("Saving…");
    const timer = window.setTimeout(async () => {
      try { await saveWorkspaceFn({ data: { field: "drafts", key: draftKey, value: { to: compose.to, cc: compose.cc, bcc: composeBcc, subject: compose.subject, html: composeHtml, quoteId: compose.quoteId, mailbox, files: composeFiles, updatedAt: new Date().toISOString() } } }); setDraftState("Saved"); } catch { setDraftState("Not saved"); }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [compose, composeHtml, composeBcc, composeFiles, mailbox, composeOpen, draftsReady, draftKey, saveWorkspaceFn]);
  useEffect(() => {
    if (!selectedId || restoredReply.current !== selectedId || sendingRef.current || (!replyHtmlDraft && !replyFiles.length && !cc && !bcc && !quoteId)) return;
    const timer = window.setTimeout(async () => {
      try { await saveWorkspaceFn({ data: { field: "drafts", key: `reply:${selectedId}`, value: { html: replyHtmlDraft, cc, bcc, quoteId, files: replyFiles, mailbox, subject: thread.data?.enquiry.subject } } }); } catch { toast.error("Reply draft could not be saved"); }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [replyHtmlDraft, replyFiles, cc, bcc, quoteId, selectedId, mailbox, saveWorkspaceFn]);
  async function organize(patch: EmailOrganization) {
    if (!selectedId) return;
    try { await saveWorkspaceFn({ data: { field: "organization", key: selectedId, value: { ...organization[selectedId], ...patch } } }); await workspace.refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }
  async function addNote() {
    if (!selectedId || !note.trim()) return;
    try { await notesFn({ data: { enquiryId: selectedId, body: note } }); setNote(""); await notes.refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }
  function openDraft(key: string, draft: EmailDraft) {
    setDraftKey(key); setCompose({ to: draft.to ?? "", cc: draft.cc ?? "", subject: draft.subject ?? "", body: "", quoteId: draft.quoteId ?? "" }); setComposeHtml(draft.html); setComposeBcc(draft.bcc ?? ""); setComposeFiles(draft.files ?? []); if (draft.mailbox) setMailbox(draft.mailbox); setComposeOpen(true);
  }
  async function removeDraft() {
    try { await saveWorkspaceFn({ data: { field: "drafts", key: draftKey, value: null } }); setComposeHtml(""); setCompose({ to: "", cc: "", subject: "", body: "", quoteId: "" }); setComposeFiles([]); setComposeBcc(""); setComposeOpen(false); await workspace.refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  const list = useQuery({
    queryKey: ["inbox", scope, status, search, folder, mailbox, user?.id],
    queryFn: () => listEnquiriesFn({ data: { scope, status, search, folder: folder === "drafts" || folder === "flagged" ? "inbox" : folder, mailbox: mailbox || undefined } }),
    enabled: !!user,
    refetchInterval: 30000,
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
    setComposeError(null);
    const bodyText = composeEditor.current?.getText() ?? "";
    const bodyHtml = composeEditor.current?.getHtml() ?? "";
    if (!compose.to.trim() || !compose.subject.trim() || !bodyText) {
      setComposeError("To, subject and message are required");
      toast.error("To, subject and message are required");
      return;
    }
    setComposing(true);
    sendingRef.current = true;
    try {
      const res = await composeFn({
        data: {
          to: compose.to.trim(),
          subject: compose.subject.trim(),
          body: bodyText,
          bodyHtml,
          cc: splitAddrs(compose.cc),
          bcc: splitAddrs(composeBcc),
          quoteId: compose.quoteId || null,
          files: toFilePayload(composeFiles),
          mailbox,
        },
      });
      toast.success(compose.quoteId ? "Email sent with quotation attached" : "Email sent");
      void saveWorkspaceFn({ data: { field: "drafts", key: draftKey, value: null } }).then(() => workspace.refetch());
      setComposeHtml("");
      setComposeOpen(false);
      setCompose({ to: "", cc: "", subject: "", body: "", quoteId: "" });
      setComposeBcc("");
      setShowComposeBcc(false);
      setComposeFiles([]);
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      if (res.enquiryId) void navigate({ to: "/inbox", search: { enquiry: res.enquiryId, quote: undefined } });
    } catch (caught) {
      setComposeError(caught instanceof Error ? caught.message : String(caught));
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setComposing(false);
      sendingRef.current = false;
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
    setDraftKey(`forward:${Date.now()}`);
    setComposeHtml("");
    setComposeFiles([]);
    setComposeOpen(true);
  }

  const enquiries = [...(list.data?.enquiries ?? [])].filter((e) => folder !== "flagged" || organization[e.id]?.flagged).sort((a, b) => Number(!!organization[b.id]?.pinned) - Number(!!organization[a.id]?.pinned));
  const canAssign = !!list.data?.canAssign;
  const active = thread.data?.enquiry ?? null;
  const filteredManagers = useMemo(() => managers.data ?? [], [managers.data]);
  const openEnquiry = (id: string) => navigate({ to: "/inbox", search: { enquiry: id, quote: undefined }, resetScroll: false });

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
    const bodyText = replyInput.current?.getText() ?? "";
    const bodyHtml = replyInput.current?.getHtml() ?? "";
    if (!selectedId || !bodyText) return;
    setSending(true);
    sendingRef.current = true;
    setError(null);
    try {
      await replyFn({
        data: {
          enquiryId: selectedId,
          body: bodyText,
          bodyHtml,
          cc: splitAddrs(cc),
          bcc: splitAddrs(bcc),
          quoteId: quoteId || null,
          files: toFilePayload(replyFiles),
          mailbox,
        },
      });
      toast.success(quoteId ? "Reply sent with quotation attached" : "Reply sent");
      void saveWorkspaceFn({ data: { field: "drafts", key: `reply:${selectedId}`, value: null } }).then(() => workspace.refetch());
      setReplyHtmlDraft("");
      setReply("");
      replyInput.current?.clear();
      setReplyFiles([]);
      setBcc("");
      setQuoteId("");
      setCc("");
      setShowCc(false);
      void queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  async function retryMessage(messageId: string) {
    setError(null);
    try {
      await retryFn({ data: { messageId } });
      toast.success("Message resent successfully");
      void queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
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
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 min-w-0 flex-col overflow-hidden bg-card">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-solar/10 px-4 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-solar"><Mail className="h-4 w-4" /> IMT Mail</span>
        <span className="flex h-8 items-center border-b-2 border-solar px-1 text-xs font-semibold">Home</span>
        <select aria-label="Department mailbox" value={mailbox} onChange={(e) => { setMailbox(e.target.value); setScope("all"); }} className="ml-auto h-8 min-w-0 max-w-[calc(100%-3rem)] rounded-sm border border-border bg-card px-2 text-xs">
          {(workspace.data?.departments ?? []).map((d) => <optgroup key={d.department} label={d.department}>{d.addresses.map((address) => <option key={address} value={address}>{d.department} · {address}</option>)}</optgroup>)}
        </select>
        <Button variant="ghost" size="icon" title="Email signature" aria-label="Email signature" onClick={() => { setSignatureHtml(workspace.data?.signatureHtml ?? ""); setSignatureOpen(true); }}><Settings2 className="h-4 w-4" /></Button>
      </div>
      <div className="flex min-h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/40 px-3 py-1">
        <Button onClick={() => { setDraftKey("new"); setComposeOpen(true); }} size="sm" className="mr-2 h-8 shrink-0 rounded-sm bg-solar text-solar-foreground hover:bg-solar/90"><MailPlus className="h-4 w-4" /> New mail</Button>
        <Button variant="ghost" size="sm" disabled={!active || active.status === "closed"} onClick={() => { setReplyExpanded(true); window.setTimeout(() => replyInput.current?.focus(), 50); }} className="shrink-0 rounded-sm"><Reply className="h-4 w-4" /> Reply</Button>
        <Button variant="ghost" size="sm" disabled={!active} onClick={forwardActive} className="shrink-0 rounded-sm"><Forward className="h-4 w-4" /> Forward</Button>
        <span className="mx-2 h-5 w-px shrink-0 bg-border" />
        <Button variant="ghost" size="sm" disabled={!active} onClick={toggleArchive} className="shrink-0 rounded-sm"><Archive className="h-4 w-4" /> {folder === "archive" ? "Move to inbox" : "Archive"}</Button>
        <Button variant="ghost" size="sm" disabled={!active} title="Follow up" onClick={() => organize({ flagged: !organization[selectedId ?? ""]?.flagged })}><Flag className={`h-4 w-4 ${organization[selectedId ?? ""]?.flagged ? "text-amber" : ""}`} /> Follow up</Button>
        <Button variant="ghost" size="sm" disabled={!active} onClick={() => organize({ unread: !organization[selectedId ?? ""]?.unread })}><Mail className="h-4 w-4" /> {organization[selectedId ?? ""]?.unread ? "Mark read" : "Mark unread"}</Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-muted/35 xl:flex">
        <div className="border-b border-border p-3">
          <span className="text-xs font-semibold text-muted-foreground">Favourites</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold">
            <ChevronDown className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{mailbox}</span>
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
            {([{ key: "drafts", label: "Drafts", icon: FileText }, { key: "flagged", label: "Follow up", icon: Flag }, { key: "sent", label: "Sent", icon: Send }, { key: "archive", label: "Archive", icon: Archive }] as const).map((item) => (
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
              <h1 className="font-display text-xl font-semibold">{folder === "sent" ? "Sent" : folder === "archive" ? "Archive" : folder === "drafts" ? "Drafts" : folder === "flagged" ? "Follow up" : "Inbox"}</h1>
              <p className="text-xs text-muted-foreground">{enquiries.length} conversations</p>
            </div>
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <select aria-label="Mailbox folder" value={folder} onChange={(event) => { const next = event.target.value; if (next === "inbox" || next === "sent" || next === "archive" || next === "drafts" || next === "flagged") { setFolder(next); setStatus("all"); if (next !== "inbox") setScope("all"); } }} className="h-7 max-w-full border border-border bg-background px-2 text-xs xl:hidden"><option value="inbox">Inbox</option><option value="sent">Sent</option><option value="archive">Archive</option><option value="drafts">Drafts</option><option value="flagged">Follow up</option></select>
            <div className="flex flex-wrap gap-1 xl:hidden">
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

        {error || list.isError ? (
          <div className="flex items-start gap-2 border-b border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error || list.error?.message}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {folder === "drafts" ? <div>{Object.entries(workspace.data?.drafts ?? {}).filter(([, d]) => d.html || d.subject || d.to).map(([key, draft]) => <Button key={key} variant="ghost" className="h-auto w-full justify-start rounded-none border-b border-border p-4 text-left" onClick={() => key.startsWith("reply:") ? openEnquiry(key.slice(6)) : openDraft(key, draft)}><FileText className="h-4 w-4 shrink-0 text-solar" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{draft.subject || "(No subject)"}</span><span className="block truncate text-xs text-muted-foreground">{draft.to || "Reply draft"}</span></span></Button>)}</div> : list.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading messages…</div>
          ) : list.isError ? (
            <div className="p-6"><Button variant="outline" onClick={() => list.refetch()}><RefreshCw className="h-4 w-4" /> Retry</Button></div>
          ) : enquiries.length === 0 ? (
            <div className="px-8 py-14 text-center">
              <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">Your inbox is clear</p>
            </div>
          ) : (
            enquiries.map((item) => (
              <EnquiryRow key={item.id} organization={organization[item.id]} enquiry={item} active={item.id === selectedId} onSelect={() => openEnquiry(item.id)} />
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
              <Button variant="ghost" size="sm" disabled={active.status === "closed"} onClick={() => { setReplyExpanded(true); window.setTimeout(() => replyInput.current?.focus(), 50); }} className="rounded-sm" title="Reply">
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
              <Button variant="ghost" size="icon" onClick={() => thread.refetch()} className="ml-auto rounded-sm" title="Refresh conversation">
                <RefreshCw className={`h-4 w-4 ${thread.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-semibold text-solar">{active.reference}</div>
                  <h2 className="break-words font-display text-lg font-semibold text-foreground">{active.subject}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="break-all">{active.contact_name || active.contact_email}</span>
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
                <span className={`max-w-24 shrink-0 whitespace-normal px-2 py-1 text-xs font-semibold ${statusClass(active.status)}`}>
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" title="Pin conversation" onClick={() => organize({ pinned: !organization[active.id]?.pinned })}><Pin className={`h-4 w-4 ${organization[active.id]?.pinned ? "text-solar" : ""}`} /></Button>
                <Tag className="h-3.5 w-3.5 text-muted-foreground" /><select aria-label="Email category" value={organization[active.id]?.category ?? ""} onChange={(e) => organize({ category: e.target.value })} className="h-7 border border-border bg-card px-2 text-xs"><option value="">Categorize</option><option>Urgent</option><option>Finance</option><option>Technical</option><option>Sales</option></select>
                <Button variant="ghost" size="sm" onClick={() => setShowNotes(!showNotes)}><StickyNote className="h-3.5 w-3.5" /> Internal notes</Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {showNotes ? <section className="border-b border-border bg-warning/10 p-4"><h3 className="mb-2 text-xs font-semibold">Internal notes · Not sent to the customer</h3>{(notes.data ?? []).map((n: any) => <div key={n.id} className="mb-2 text-xs"><span className="font-semibold">{n.author}</span><p className="whitespace-pre-wrap break-words">{n.body}</p></div>)}<div className="flex gap-2"><Input aria-label="Internal note" value={note} onChange={(e) => setNote(e.target.value)} /><Button variant="outline" size="sm" disabled={!note.trim()} onClick={addNote}>Add note</Button></div></section> : null}
              {(thread.data?.messages ?? []).map((message) => (
                <MessagePanel
                  key={message.id}
                  message={message}
                  onOpenAttachment={(mail, attachment) => openAttachment(mail.id, attachment.id)}
                  onRetry={(id) => void retryMessage(id)}
                />
              ))}
            </div>

            {active.status !== "closed" ? (
              <div className={`${replyExpanded ? "block" : "hidden lg:block"} max-h-[45%] shrink-0 overflow-y-auto border-t border-border bg-card p-3 sm:p-4`}>
                <Button variant="ghost" size="sm" className="mb-1 lg:hidden" onClick={() => setReplyExpanded(false)}>Minimize reply</Button>
                {error ? <p role="alert" className="mb-2 break-words text-xs text-destructive">{error}</p> : null}
                {showCc ? (
                  <div className="mb-2 space-y-1 border-b border-border pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-xs text-muted-foreground">Cc</span>
                      <Input aria-label="CC recipients" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Email addresses, separated by commas" className="h-7 flex-1 border-0 px-0 text-xs shadow-none focus-visible:ring-0" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-xs text-muted-foreground">Bcc</span>
                      <Input aria-label="BCC recipients" value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="Hidden recipients, separated by commas" className="h-7 flex-1 border-0 px-0 text-xs shadow-none focus-visible:ring-0" />
                    </div>
                  </div>
                ) : null}
                <EmailComposer
                  ref={replyInput}
                  placeholder={`Reply to ${active.contact_name || active.contact_email}`}
                  minHeight={90}
                  vars={{ customer_name: active.contact_name, reference: active.reference, sender_name: user?.user_metadata?.full_name as string | undefined }}
                  files={replyFiles}
                  onFilesChange={setReplyFiles}
                  onChange={(text, html) => { setReply(text); setReplyHtmlDraft(html); }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2">
                  <Button onClick={sendReply} disabled={sending || !reply.trim()} className="h-8 rounded-sm bg-solar px-4 text-solar-foreground hover:bg-solar/90">
                    <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowCc((visible) => !visible)} className="h-8 rounded-sm text-xs">
                    Cc / Bcc
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
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
      </div>

      <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) void workspace.refetch(); }}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>New message <span className="ml-2 text-xs font-normal text-muted-foreground">{draftState}</span></DialogTitle></DialogHeader>
          <p className="break-all text-xs text-muted-foreground">From: {mailbox}</p>
          <div className="space-y-2">
            {composeError ? <div role="alert" className="text-sm text-destructive"><p>{composeError.startsWith("Gateway 500") ? "The IMT email service returned error 500. Your email was not accepted; your message is still here." : composeError}</p><details className="mt-1 text-xs"><summary className="cursor-pointer">Error details</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-sans">{composeError}</pre></details></div> : null}
            <Input aria-label="To" placeholder="To (client email)" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
            <div className="flex items-center gap-2">
              <Input aria-label="Cc" placeholder="Cc (optional, comma separated)" value={compose.cc} onChange={(e) => setCompose({ ...compose, cc: e.target.value })} />
              {!showComposeBcc ? <Button type="button" variant="ghost" size="sm" onClick={() => setShowComposeBcc(true)}>Bcc</Button> : null}
            </div>
            {showComposeBcc ? <Input aria-label="Bcc" placeholder="Bcc (hidden recipients, comma separated)" value={composeBcc} onChange={(e) => setComposeBcc(e.target.value)} /> : null}
            <Input aria-label="Subject" placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
            <EmailComposer
              ref={composeEditor}
              placeholder="Write your message…"
              minHeight={200}
              vars={{ sender_name: user?.user_metadata?.full_name as string | undefined }}
              files={composeFiles}
              onFilesChange={setComposeFiles}
              onChange={(_text, html) => setComposeHtml(html)}
            />
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={removeDraft}><Trash2 className="h-4 w-4" /> Discard</Button><Button variant="outline" onClick={async () => { await saveWorkspaceFn({ data: { field: "drafts", key: draftKey, value: { to: compose.to, cc: compose.cc, bcc: composeBcc, subject: compose.subject, html: composeEditor.current?.getHtml() ?? composeHtml, files: composeFiles, mailbox, quoteId: compose.quoteId } } }); setComposeOpen(false); await workspace.refetch(); }}><Save className="h-4 w-4" /> Save draft</Button>
            <Button onClick={sendCompose} disabled={composing} className="bg-solar text-solar-foreground hover:bg-solar/90">
              <Send className="h-4 w-4" /> {composing ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Your email signature</DialogTitle></DialogHeader><textarea aria-label="HTML signature" className="min-h-32 w-full rounded-sm border border-border bg-background p-3 font-mono text-xs" value={signatureHtml} onChange={(e) => setSignatureHtml(e.target.value)} placeholder="Paste your HTML signature" /><EmailHtmlView html={signatureHtml} title="Signature preview" /><DialogFooter><Button variant="ghost" onClick={() => setSignatureOpen(false)}>Cancel</Button><Button onClick={async () => { try { await saveWorkspaceFn({ data: { field: "signature_html", value: signatureHtml } }); await workspace.refetch(); setSignatureOpen(false); toast.success("Signature saved"); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } }}><Save className="h-4 w-4" /> Save signature</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
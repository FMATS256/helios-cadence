import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmailHtmlView } from "@/components/email-html-view";
import { EmailAttachment } from "@/components/email-attachment";
import type { InboxMessage } from "@/lib/inbox.shared";
import { ChevronDown, ChevronRight, Paperclip, RefreshCw, Reply } from "lucide-react";

export function EmailConversationMessage({ message, expanded, onToggle, onReply, onRetry }: {
  message: InboxMessage;
  expanded: boolean;
  onToggle: () => void;
  onReply?: () => void;
  onRetry: (id: string) => void;
}) {
  const sender = message.sender_name || message.from_address;
  const preview = (message.body_text || message.body_html?.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ") || "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const initials = sender.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <article className="border-b border-border bg-card" data-message-id={message.id}>
      <div className="flex items-start gap-1 px-3 py-2 sm:px-5">
        <Button variant="ghost" aria-label={`${expanded ? "Collapse" : "Expand"} message from ${sender}`} aria-expanded={expanded} className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-sm px-1 py-2 text-left" onClick={onToggle}>
          <Avatar className="h-9 w-9 shrink-0"><AvatarFallback className={message.direction === "inbound" ? "bg-info/15 text-info" : "bg-solar/15 text-solar"}>{initials}</AvatarFallback></Avatar>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{sender}</span>{message.attachments.length ? <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{expanded ? `To: ${message.to_address}` : preview || "(empty message)"}</span>
            {expanded && message.cc_address ? <span className="block break-all text-xs font-normal text-muted-foreground">Cc: {message.cc_address}</span> : null}
          </span>
          <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{new Date(message.created_at).toLocaleString("en-GB", { timeZone: "Africa/Harare", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        </Button>
        {onReply ? <Button variant="ghost" size="icon" className="mt-2 h-8 w-8 shrink-0" title="Reply to this conversation" aria-label="Reply to this conversation" onClick={onReply}><Reply className="h-4 w-4" /></Button> : null}
      </div>
      {expanded ? <div className="px-4 pb-5 sm:pl-16 sm:pr-6">
        {message.direction === "outbound" && message.sender_name && message.delivery_status === "sent" ? <span className="mb-2 inline-block rounded-sm bg-teal/15 px-2 py-0.5 text-[10px] font-medium text-teal">Replied by {message.sender_name}</span> : null}
        {message.delivery_status === "failed" ? <div role="alert" className="mb-3 text-xs text-destructive"><span>Send failed</span><Button variant="outline" size="sm" className="ml-2 h-7" onClick={() => onRetry(message.id)}><RefreshCw className="h-3 w-3" /> Retry</Button>{message.delivery_error ? <details className="mt-2"><summary>Delivery details</summary><p className="whitespace-pre-wrap break-all">{message.delivery_error}</p></details> : null}</div> : null}
        {message.attachments.length ? <div className="mb-3 flex flex-wrap gap-2">{message.attachments.map((attachment) => <EmailAttachment key={attachment.id} messageId={message.id} attachment={attachment} />)}</div> : null}
        {message.body_html ? <EmailHtmlView html={message.body_html} title={`Email from ${sender}`} /> : <div className="whitespace-pre-wrap break-words text-sm leading-6">{message.body_text || "(empty message)"}</div>}
      </div> : null}
    </article>
  );
}
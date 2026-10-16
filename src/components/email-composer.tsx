import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Quote, Eraser, Paperclip, X, FileText, Sparkles, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { withoutStaffSignature } from "@/lib/email-compose.shared";
import { EmailHtmlView } from "@/components/email-html-view";

export type ComposerFile = { filename: string; contentType: string; base64: string; size: number };

export type ComposerHandle = {
  getHtml: () => string;
  getText: () => string;
  setHtml: (html: string) => void;
  focus: () => void;
  clear: () => void;
};

export type TemplateVars = { customer_name?: string | null; reference?: string | null; sender_name?: string | null };

const TEMPLATES: { key: string; label: string; html: string }[] = [
  {
    key: "quote-follow-up",
    label: "Quotation follow-up",
    html: "<p>Dear {{customer_name}},</p><p>I trust you are well. I am following up on the quotation we shared with you under reference {{reference}}.</p><p>Please let me know if you have any questions, or if you would like us to adjust the scope, quantities or payment terms. Once you confirm, we will schedule delivery and installation.</p>",
  },
  {
    key: "site-survey",
    label: "Site survey request (Fibre / Starlink)",
    html: "<p>Dear {{customer_name}},</p><p>To prepare for your installation, kindly share the following site details:</p><ul><li>Physical address and GPS coordinates</li><li>On-site contact person and phone number</li><li>Building access times and any security requirements</li><li>Power availability at the installation point</li></ul><p>Once received, our technical team will confirm a survey date.</p>",
  },
  {
    key: "proof-of-payment",
    label: "Proof of payment request",
    html: "<p>Dear {{customer_name}},</p><p>Thank you for your business. Kindly send us the proof of payment for reference {{reference}} so that our Billing team can allocate it to your account.</p><p>Please include your account number or the invoice number as the payment reference.</p>",
  },
  {
    key: "maintenance",
    label: "Scheduled maintenance notice",
    html: "<p>Dear {{customer_name}},</p><p>Please be advised that we will carry out scheduled maintenance on our network. You may experience brief service interruptions during this window.</p><p>We apologise for any inconvenience and appreciate your patience.</p>",
  },
  {
    key: "welcome",
    label: "Service handover / welcome",
    html: "<p>Dear {{customer_name}},</p><p>Welcome to IMT Solutions. Your service is now active and I will be your Account Manager going forward.</p><p>For any support requests, reply to this email or contact our support desk and we will assist promptly.</p>",
  },
];

function fill(html: string, vars: TemplateVars) {
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return html
    .replace(/\{\{customer_name\}\}/g, esc(vars.customer_name?.trim() || "Customer"))
    .replace(/\{\{reference\}\}/g, esc(vars.reference?.trim() || "your enquiry"))
    .replace(/\{\{sender_name\}\}/g, esc(vars.sender_name?.trim() || "IMT Solutions"));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const MAX_TOTAL = 15 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Props = {
  placeholder?: string;
  minHeight?: number;
  vars?: TemplateVars;
  files: ComposerFile[];
  onFilesChange: (files: ComposerFile[]) => void;
  onChange?: (text: string, html: string) => void;
  extraToolbar?: React.ReactNode;
  clientMessage?: { html: string; sender: string };
};

export const EmailComposer = forwardRef<ComposerHandle, Props>(function EmailComposer(
  { placeholder, minHeight = 160, vars = {}, files, onFilesChange, onChange, extraToolbar, clientMessage },
  ref,
) {
  const editor = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const processing = useRef(false);
  const [addingFiles, setAddingFiles] = useState(false);

  const sync = () => {
    const text = editor.current?.innerText.trim() ?? "";
    setEmpty(!text);
    onChange?.(text, editor.current?.innerHTML ?? "");
  };

  useImperativeHandle(ref, () => ({
    getHtml: () => editor.current?.innerHTML ?? "",
    getText: () => editor.current?.innerText.trim() ?? "",
    setHtml: (html: string) => {
      if (editor.current) editor.current.innerHTML = withoutStaffSignature(html);
      sync();
    },
    focus: () => editor.current?.focus(),
    clear: () => {
      if (editor.current) editor.current.innerHTML = "";
      sync();
    },
  }));

  useEffect(() => {
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* ignore */ }
  }, []);

  const exec = (cmd: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(cmd, false, value);
    sync();
  };

  const addLink = () => {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    if (!/^(https?:|mailto:|tel:)/i.test(url)) return toast.error("Links must start with https://, mailto: or tel:");
    exec("createLink", url);
  };

  const insertTemplate = (key: string) => {
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t || !editor.current) return;
    const html = fill(t.html, vars);
    if (editor.current.innerText.trim()) {
      editor.current.focus();
      document.execCommand("insertHTML", false, html);
    } else {
      editor.current.innerHTML = html;
    }
    sync();
  };

  async function addFiles(list: FileList | File[]) {
    if (processing.current) { toast.info("Please wait for your attachments to finish loading"); return; }
    processing.current = true;
    setAddingFiles(true);
    try {
    const incoming = Array.from(list);
    let total = files.reduce((s, f) => s + f.size, 0);
    const next = [...files];
    for (const file of incoming) {
      if (next.length >= 10) { toast.error("You can attach up to 10 files"); break; }
      if (total + file.size > MAX_TOTAL) { toast.error(`${file.name} is too large — attachments are limited to 15 MB in total`); continue; }
      const base64 = await readAsBase64(file);
      next.push({ filename: file.name, contentType: file.type || "application/octet-stream", base64, size: file.size });
      total += file.size;
    }
    onFilesChange(next);
    } catch { toast.error("Could not read the attachment. Please try again."); }
    finally { processing.current = false; setAddingFiles(false); }
  }

  async function insertImage(file: File) {
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) { toast.error("Choose a PNG, JPEG, GIF or WebP image"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Inline images are limited to 2 MB"); return; }
    const base64 = await readAsBase64(file);
    exec("insertHTML", `<img src="data:${file.type};base64,${base64}" alt="" style="max-width:100%;height:auto"/>`);
  }
  const btn = "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <div
      className="relative flex w-full min-w-0 flex-col bg-background"
      onDragEnter={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
      onDragOver={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDrop={(e) => { if (!e.dataTransfer.files?.length) return; e.preventDefault(); dragDepth.current = 0; setDragging(false); void addFiles(e.dataTransfer.files); }}
    >
      {dragging ? <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 border-2 border-dashed border-primary bg-background/95 text-sm font-medium text-primary" role="status"><Paperclip className="h-5 w-5" /> Drop files to attach</div> : null}
      <div className="order-2 flex flex-wrap items-center gap-0.5 border-t border-border px-1.5 py-1">
        <Button variant="ghost" type="button" aria-label="Bold" title="Bold" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" type="button" aria-label="Italic" title="Italic" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" type="button" aria-label="Underline" title="Underline" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}><Underline className="h-3.5 w-3.5" /></Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" type="button" aria-label="Bulleted list" title="Bullets" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" type="button" aria-label="Numbered list" title="Numbering" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" type="button" aria-label="Quote" title="Quote" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("formatBlock", "blockquote")}><Quote className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" type="button" aria-label="Insert link" title="Link" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={addLink}><Link2 className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" type="button" aria-label="Clear formatting" title="Clear formatting" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("removeFormat")}><Eraser className="h-3.5 w-3.5" /></Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" type="button" aria-label="Attach files" title="Attach files" className={btn} onClick={() => fileInput.current?.click()}><Paperclip className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" type="button" aria-label="Insert image" title="Insert image" className={btn} onClick={() => imageInput.current?.click()}><ImagePlus className="h-3.5 w-3.5" /></Button>
        <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void insertImage(file); e.target.value = ""; }} />
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex items-center gap-1">
          <Sparkles className="ml-1 h-3.5 w-3.5 text-solar" />
          <select
            aria-label="Insert quick part"
            value=""
            onChange={(e) => insertTemplate(e.target.value)}
            className="h-7 max-w-[150px] border-0 bg-transparent text-xs text-foreground outline-none sm:max-w-none"
          >
            <option value="">Quick parts…</option>
            {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        {extraToolbar}
      </div>

      <div className="relative order-1 w-full min-w-0">
        {empty ? <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">{placeholder}</div> : null}
        <div
          ref={editor}
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onPaste={(e) => {
            if (e.clipboardData.files?.length) { e.preventDefault(); void addFiles(e.clipboardData.files); }
            else {
              const html = e.clipboardData.getData("text/html");
              const clean = withoutStaffSignature(html);
              if (html && clean !== html) { e.preventDefault(); exec("insertHTML", clean); }
            }
          }}
          style={{ minHeight }}
          className="w-full min-w-0 break-words [&_img]:max-w-full [&_img]:h-auto max-h-[50vh] overflow-y-auto px-3 py-3 text-base leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6"
        />
      </div>
      {clientMessage?.html ? <details className="order-1 min-w-0 border-t border-border" open><summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">Client’s message & signature · {clientMessage.sender}</summary><div className="max-h-48 overflow-y-auto" aria-label="Client signature preview"><EmailHtmlView html={clientMessage.html} title={`Client signature preview from ${clientMessage.sender}`} /></div></details> : null}
      {addingFiles ? <div role="status" className="order-3 px-3 py-2 text-xs text-muted-foreground">Adding attachments…</div> : null}

      {files.length ? (
        <div className="order-3 flex flex-wrap gap-1.5 border-t border-border px-2 py-2">
          {files.map((f, i) => (
            <span key={`${f.filename}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-muted/50 px-2 py-1 text-xs">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="max-w-[160px] truncate">{f.filename}</span>
              <span className="text-muted-foreground">{formatSize(f.size)}</span>
              <Button variant="ghost" type="button" disabled={addingFiles} aria-label={`Remove ${f.filename}`} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => onFilesChange(files.filter((_, j) => j !== i))}>
                <X className="h-3 w-3" />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
});

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, Loader2, Paperclip } from "lucide-react";
import { getAttachmentLink } from "@/lib/inbox.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function EmailAttachment({ messageId, attachment }: { messageId: string; attachment: { id: string; filename: string; content_type: string | null } }) {
  const getLink = useServerFn(getAttachmentLink);
  const [file, setFile] = useState<{ blob: Blob; url: string; text?: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setLoading(true); setError(""); setFile(null);
    (async () => {
      try {
        const result = await getLink({ data: { messageId, attachmentId: attachment.id } });
        if (!result.url) throw new Error(result.error || "Attachment unavailable");
        const response = await fetch(result.url, { credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error(`Could not load file (${response.status})`);
        const bytes = await response.arrayBuffer();
        const type = attachment.content_type || response.headers.get("content-type") || "application/octet-stream";
        const blob = new Blob([bytes], { type });
        const text = /^(text\/plain|text\/csv|text\/calendar|application\/json)/i.test(type) ? await blob.text() : undefined;
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ blob, url: objectUrl, text });
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load attachment"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [messageId, attachment.id, attachment.content_type, getLink, attempt]);

  function download() {
    if (!file) return;
    const name = attachment.filename.replace(/[\\/\r\n]/g, "-");
    // Save straight to the device's Downloads (phones included) instead of opening a share sheet.
    const saved = new File([file.blob], name, { type: file.blob.type || "application/octet-stream" });
    const url = URL.createObjectURL(saved);
    const link = document.createElement("a"); link.href = url; link.download = name; link.rel = "noopener";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const image = !!file && /^image\/(png|jpeg|gif|webp)$/.test(file.blob.type);
  const pdf = !!file && file.blob.type.split(";")[0] === "application/pdf";
  return <div className="min-w-0 max-w-full rounded-sm border border-border p-2">
    <div className="flex items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 break-all text-xs">{attachment.filename}</span>{loading ? <Loader2 aria-label="Loading attachment" className="h-4 w-4 animate-spin" /> : null}</div>
    <div className="mt-2 flex gap-1"><Button size="sm" variant="ghost" disabled={!file} onClick={() => setOpen(true)} aria-label={`View ${attachment.filename}`}><Eye className="h-4 w-4" /> View</Button><Button size="sm" variant="outline" disabled={!file} onClick={download} aria-label={`Download ${attachment.filename}`}><Download className="h-4 w-4" /> Download</Button></div>
    {error ? <div className="mt-2 max-w-sm text-xs text-destructive" role="alert">{error}<Button variant="ghost" size="sm" onClick={() => setAttempt(attempt + 1)}>Retry</Button></div> : null}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle className="break-all">{attachment.filename}</DialogTitle></DialogHeader>
      {file && image ? <img src={file.url} alt={attachment.filename} className="max-h-[65dvh] w-full object-contain" /> : file && pdf ? <><a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm text-solar underline">Open PDF</a><iframe title={attachment.filename} src={file.url} className="h-[60dvh] w-full border-0" /></> : file?.text !== undefined ? <pre className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words text-sm">{file.text}</pre> : <p className="text-sm text-muted-foreground">Preview is not available for this file type.</p>}
      <Button disabled={!file} onClick={download}><Download className="h-4 w-4" /> Download</Button>
    </DialogContent></Dialog>
  </div>;
}
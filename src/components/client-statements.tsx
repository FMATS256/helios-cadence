import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { listClientStatements, downloadClientStatement } from "@/lib/client-statements.functions";

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = file.name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function ClientStatements() {
  const { user } = useAuth();
  const list = useServerFn(listClientStatements), prepare = useServerFn(downloadClientStatement);
  const query = useQuery({ queryKey: ["client-statements", user?.id], queryFn: () => list(), enabled: !!user, retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState<{ date: string; files: File[] } | null>(null);
  async function load(date: string) {
    setBusy(date); setReady(null);
    try {
      const files = await prepare({ data: { date } });
      setReady({ date, files: files.map(f => new File([Uint8Array.from(atob(f.base64), c => c.charCodeAt(0))], f.filename, { type: "application/pdf" })) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Statement could not be prepared"); }
    finally { setBusy(null); }
  }
  async function download(file: File) {
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return; }
      catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; }
    }
    saveFile(file);
  }
  return <section className="portal-statements space-y-5 min-w-0">
    <header className="portal-page-heading"><h1 className="text-2xl sm:text-3xl font-bold">My Statements</h1></header>
    {query.isPending ? <p className="py-8 text-muted-foreground">Loading statements…</p> : query.error ? <div role="alert" className="space-y-3"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div> : !query.data?.length ? <p className="py-8 text-muted-foreground">No statements available.</p> : query.data.map(row => <article key={row.date} className="border border-border bg-card rounded-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex gap-3 min-w-0"><FileText className="h-5 w-5 text-teal shrink-0 mt-1" /><div><h2 className="font-semibold">{row.current ? "Current account statement" : new Date(`${row.date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2><p className="text-sm text-muted-foreground mt-1">As at {new Date(`${row.date}T12:00:00Z`).toLocaleDateString("en-GB")}</p></div></div>
        <Button variant="outline" disabled={busy !== null} onClick={() => load(row.date)}>{busy === row.date ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{busy === row.date ? "Preparing…" : "Prepare PDF"}</Button>
      </div>
      {ready?.date === row.date && <div className="border-t border-border bg-muted/40 p-4 flex flex-wrap gap-3">{ready.files.map(file => <Button key={file.name} onClick={() => download(file)}><Download className="h-4 w-4" />Download {file.name.replace(/\.pdf$/, "").split("-").at(-1)} PDF</Button>)}</div>}
    </article>)}
  </section>;
}
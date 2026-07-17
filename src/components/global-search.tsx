import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { globalSearch } from "@/lib/ops.functions";

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex-1 max-w-2xl min-w-0 h-10 flex items-center gap-2 px-3 rounded-md bg-muted/50 border border-transparent hover:border-border text-left transition-colors"
      >
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground truncate flex-1">
          Search customers, invoices, receipts, tickets, assets…
        </span>
        <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>
      <GlobalSearchPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

function GlobalSearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const search = useServerFn(globalSearch);
  const { data, isFetching } = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => search({ data: { q, limit: 6 } }),
    enabled: !!user && q.trim().length > 1,
    staleTime: 30_000,
  });

  const go = (to: any, params?: any) => {
    onOpenChange(false);
    setQ("");
    navigate({ to, params });
  };

  const r = data ?? { customers: [], invoices: [], payments: [], tickets: [], subscriptions: [], assets: [], credentials: [] };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search account #, name, invoice, receipt, phone, email…" value={q} onValueChange={setQ} />
      <CommandList>
        {q.trim().length < 2 && (
          <CommandEmpty>Type at least 2 characters. Try an M-number, invoice #, or receipt #.</CommandEmpty>
        )}
        {q.trim().length >= 2 && !isFetching && (r.customers.length + r.invoices.length + r.payments.length + r.tickets.length + r.subscriptions.length + r.assets.length + r.credentials.length === 0) && (
          <CommandEmpty>No results for “{q}”.</CommandEmpty>
        )}

        {r.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {r.customers.map((c: any) => (
              <CommandItem key={c.id} value={`c-${c.id}-${c.account_number}-${c.company_name}`} onSelect={() => go("/customers/$accountNumber", { accountNumber: c.account_number })}>
                <div className="flex flex-col">
                  <span className="font-medium">{c.company_name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{c.account_number} · {c.primary_email || c.primary_phone || "—"}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {r.invoices.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Invoices">
              {r.invoices.map((i: any) => (
                <CommandItem key={i.id} value={`i-${i.id}-${i.invoice_number}`} onSelect={() => go("/invoices/$id", { id: i.id })}>
                  <div className="flex justify-between w-full">
                    <span className="font-mono text-sm">{i.invoice_number}</span>
                    <span className="text-xs text-muted-foreground">{i.currency} {Number(i.total).toFixed(2)} · {i.status}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {r.payments.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Receipts / Payments">
              {r.payments.map((p: any) => (
                <CommandItem key={p.id} value={`p-${p.id}-${p.receipt_number}`} onSelect={() => go("/payments")}>
                  <div className="flex justify-between w-full">
                    <span className="font-mono text-sm">{p.receipt_number || p.reference || "—"}</span>
                    <span className="text-xs text-muted-foreground">{p.currency} {Number(p.amount).toFixed(2)} · {p.method}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {r.tickets.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tickets">
              {r.tickets.map((t: any) => (
                <CommandItem key={t.id} value={`t-${t.id}-${t.ticket_number}`} onSelect={() => go("/tickets/$id", { id: t.id })}>
                  <div className="flex flex-col">
                    <span className="font-medium">{t.subject}</span>
                    <span className="text-xs text-muted-foreground font-mono">{t.ticket_number} · {t.status} · {t.priority}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {r.subscriptions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Subscriptions">
              {r.subscriptions.map((s: any) => (
                <CommandItem key={s.id} value={`s-${s.id}-${s.plan_name}`} onSelect={() => go("/subscriptions")}>
                  <div className="flex justify-between w-full">
                    <span>{s.plan_name}</span>
                    <span className="text-xs text-muted-foreground">{s.account_number} · ${Number(s.amount).toFixed(2)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {r.assets.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Assets">
              {r.assets.map((a: any) => (
                <CommandItem key={a.id} value={`a-${a.id}-${a.asset_tag}`} onSelect={() => go("/assets/$id", { id: a.id })}>
                  <div className="flex justify-between w-full">
                    <span>{a.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{a.asset_tag} · {a.serial_number || "—"}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {r.credentials.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Credentials">
              {r.credentials.map((c: any) => (
                <CommandItem key={c.id} value={`cr-${c.id}-${c.name}`} onSelect={() => go("/credentials")}>
                  <div className="flex justify-between w-full">
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.credential_type} · {c.username || "—"}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

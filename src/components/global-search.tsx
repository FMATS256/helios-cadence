import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { Search, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { globalSearch } from "@/lib/ops.functions";
import { openClientDesk, ClientDeskSheet } from "@/components/techops/support-desk";

type Recent = { id: string; account_number: string; company_name: string; at: number };
const RECENTS_KEY = "imt.customer.recents";
const MAX_RECENTS = 10;

function readRecents(): Recent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Recent[];
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

function pushRecent(c: { id: string; account_number: string; company_name: string }) {
  if (typeof window === "undefined") return;
  try {
    const cur = readRecents().filter((r) => r.account_number !== c.account_number);
    cur.unshift({ ...c, at: Date.now() });
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(cur.slice(0, MAX_RECENTS)));
  } catch { /* ignore */ }
}

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
          Search clients, tickets, services, invoices, serials…
        </span>
        <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>
      <GlobalSearchPalette open={open} onOpenChange={setOpen} />
      <ClientDeskSheet />
    </>
  );
}

function GlobalSearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<Recent[]>([]);
  const search = useServerFn(globalSearch);

  useEffect(() => { if (open) setRecents(readRecents()); }, [open]);

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
  const goCustomer = (c: { id: string; account_number: string; company_name: string }) => {
    pushRecent(c);
    onOpenChange(false);
    setQ("");
    if (c.id) openClientDesk(c.id);
    else navigate({ to: "/customers/$accountNumber", params: { accountNumber: c.account_number } });
  };
  const goDesk = (customerId: string | null | undefined, fallback: () => void) => {
    onOpenChange(false); setQ("");
    if (customerId) openClientDesk(customerId); else fallback();
  };

  const r: any = data ?? { customers: [], invoices: [], payments: [], tickets: [], subscriptions: [], assets: [], credentials: [], services: [] };
  if (!r.services) r.services = [];
  const showRecents = q.trim().length < 2 && recents.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search account #, name, invoice, receipt, phone, email, domain, serial…" value={q} onValueChange={setQ} />
      <CommandList>
        {q.trim().length < 2 && recents.length === 0 && (
          <CommandEmpty>Type at least 2 characters. Try an M-number, invoice #, or receipt #.</CommandEmpty>
        )}
        {q.trim().length >= 2 && !isFetching && (r.customers.length + r.invoices.length + r.payments.length + r.tickets.length + r.subscriptions.length + r.assets.length + r.credentials.length + r.services.length === 0) && (
          <CommandEmpty>No results for “{q}”.</CommandEmpty>
        )}

        {showRecents && (
          <CommandGroup heading="Recent customers">
            {recents.map((c) => (
              <CommandItem key={c.id} value={`r-${c.id}-${c.account_number}-${c.company_name}`} onSelect={() => goCustomer(c)}>
                <div className="flex items-center gap-2 w-full">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{c.company_name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.account_number}</span>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {r.customers.length > 0 && (
          <>
            {showRecents && <CommandSeparator />}
            <CommandGroup heading="Customers">
              {r.customers.map((c: any) => (
                <CommandItem key={c.id} value={`c-${c.id}-${c.account_number}-${c.company_name}`} onSelect={() => goCustomer(c)}>
                  <div className="flex flex-col">
                    <span className="font-medium">{c.company_name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.account_number} · {c.primary_email || c.primary_phone || "—"}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {r.services.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Services">
              {r.services.map((s: any) => (
                <CommandItem key={s.id} value={`sv-${s.id}-${s.label}`} onSelect={() => goDesk(s.customer_id, () => {})}>
                  <div className="flex justify-between w-full gap-2">
                    <span className="truncate">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.kind} · {s.account_number ?? ""} · {s.status}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
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
                <CommandItem key={p.id} value={`p-${p.id}-${p.receipt_number}`} onSelect={() => p.account_number ? goCustomer({ id: p.customer_id, account_number: p.account_number, company_name: p.account_number }) : go("/payments")}>
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
                <CommandItem key={t.id} value={`t-${t.id}-${t.ticket_number}`} onSelect={() => goDesk(t.customer_id, () => go("/tickets/$id", { id: t.id }))}>
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
                <CommandItem key={s.id} value={`s-${s.id}-${s.plan_name}`} onSelect={() => s.account_number ? goCustomer({ id: s.customer_id, account_number: s.account_number, company_name: s.account_number }) : go("/subscriptions")}>
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
                <CommandItem key={a.id} value={`a-${a.id}-${a.asset_tag}`} onSelect={() => goDesk(a.customer_id, () => go("/assets/$id", { id: a.id }))}>
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
                <CommandItem key={c.id} value={`cr-${c.id}-${c.name}`} onSelect={() => go("/techops/vault")}>
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

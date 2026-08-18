import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge,
  EmptyState, RefreshButton, toneForStatus, type ColumnDef,
} from "@/components/enterprise";
import { Input } from "@/components/ui/input";
import { MapPin, Search } from "lucide-react";
import { getServiceMap, type MapSite } from "@/lib/servicemap.functions";
import { KIND_COLOR } from "@/components/service-map-view";

const ServiceMapView = lazy(() => import("@/components/service-map-view"));

export const Route = createFileRoute("/service-map")({
  head: () => ({
    meta: [
      { title: "Service Map — IMT Operations" },
      { name: "description", content: "Geographic map of every customer site, Starlink terminal, managed NAS, deployed asset and stock location IMT has worked on." },
      { property: "og:title", content: "Service Map — IMT Operations" },
      { property: "og:description", content: "Every location IMT Solutions has deployed or serviced, plotted live from operational records." },
    ],
  }),
  component: ServiceMapPage,
});

const KIND_LABEL: Record<string, string> = {
  customer: "Customer sites", branch: "Branches", starlink: "Starlink",
  nas: "Managed NAS", asset: "Deployed assets", stock: "Stock locations",
};

function ServiceMapPage() {
  const qc = useQueryClient();
  const fetchMap = useServerFn(getServiceMap);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [selected, setSelected] = useState<MapSite | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({ queryKey: ["service-map"], queryFn: () => fetchMap() });
  const sites = (q.data?.sites ?? []) as MapSite[];
  const stats = q.data?.stats;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sites.filter((s) => {
      if (kind !== "all" && s.kind !== kind) return false;
      if (!term) return true;
      return [s.label, s.address, s.customer_name, s.account_number, s.detail]
        .some((v) => String(v ?? "").toLowerCase().includes(term));
    });
  }, [sites, search, kind]);

  const cols: ColumnDef<any>[] = [
    {
      header: "Site",
      cell: (r: MapSite) => (
        <div>
          <div className="font-semibold">{r.label}</div>
          <div className="text-xs text-muted-foreground">{r.detail}</div>
        </div>
      ),
    },
    { header: "Type", cell: (r: MapSite) => <StatusBadge tone="info">{KIND_LABEL[r.kind] ?? r.kind}</StatusBadge> },
    {
      header: "Customer",
      cell: (r: MapSite) => r.account_number
        ? <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link>
        : "—",
    },
    { header: "Location", cell: (r: MapSite) => <span className="text-xs">{r.resolved_address || r.address}</span> },
    { header: "Status", cell: (r: MapSite) => <StatusBadge tone={toneForStatus(r.status)}>{r.status ?? "unknown"}</StatusBadge> },
    {
      header: "Pin", align: "right",
      cell: (r: MapSite) => r.lat != null
        ? <StatusBadge tone="success">mapped</StatusBadge>
        : <StatusBadge tone="warning">pending</StatusBadge>,
    },
  ];

  return (
    <PageShell>
      <SectionHeader
        icon={MapPin}
        title="Service Map"
        subtitle="Every location IMT has deployed, installed or serviced — plotted from live operational records."
        actions={<RefreshButton loading={q.isFetching} onClick={() => qc.invalidateQueries({ queryKey: ["service-map"] })} />}
      />

      <StatChipRow
        cols={4}
        chips={[
          { label: "Total sites", value: stats?.total ?? 0, color: "#1F6BE0" },
          { label: "Mapped", value: stats?.located ?? 0, color: "#10B981" },
          { label: "Awaiting geocode", value: stats?.pending ?? 0, color: "#F59E0B", hint: "Resolved gradually on refresh" },
          { label: "Towns / cities", value: stats?.cities ?? 0, color: "#7C3AED" },
          { label: "Customer sites", value: stats?.customers ?? 0, color: "#0EA5E9" },
          { label: "Branches", value: stats?.branches ?? 0, color: "#6366F1" },
          { label: "Starlink", value: stats?.starlink ?? 0, color: "#0284C7" },
          { label: "Deployed assets", value: stats?.assets ?? 0, color: "#059669" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <DetailCard title="Network map" icon={MapPin}>
          {mounted ? (
            <Suspense fallback={<div className="h-[560px] animate-pulse rounded-xl bg-muted" />}>
              <ServiceMapView sites={filtered} onSelect={setSelected} />
            </Suspense>
          ) : (
            <div className="h-[560px] rounded-xl bg-muted" />
          )}
        </DetailCard>

        <div className="space-y-4">
          <DetailCard title="Information">
            <div className="space-y-2 text-sm">
              {Object.entries(KIND_LABEL).map(([k, label]) => {
                const count = sites.filter((s) => s.kind === k).length;
                const on = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(on ? "all" : k)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${on ? "border-solar bg-solar/10" : "hover:bg-muted"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: KIND_COLOR[k] }} />
                      {label}
                    </span>
                    <span className="font-mono text-xs">{count}</span>
                  </button>
                );
              })}
            </div>
          </DetailCard>

          {selected && (
            <DetailCard title="Selected site">
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{selected.label}</div>
                <div className="text-xs text-muted-foreground">{selected.detail}</div>
                {selected.customer_name && <div>{selected.customer_name}</div>}
                <div className="text-xs">{selected.resolved_address || selected.address}</div>
                <StatusBadge tone={toneForStatus(selected.status)}>{selected.status ?? "unknown"}</StatusBadge>
                {selected.account_number && (
                  <div className="pt-2">
                    <Link to="/customers/$accountNumber" params={{ accountNumber: selected.account_number }} className="text-xs text-solar hover:underline">
                      Open customer 360 →
                    </Link>
                  </div>
                )}
              </div>
            </DetailCard>
          )}
        </div>
      </div>

      <DetailCard
        title={`Locations (${filtered.length})`}
        icon={MapPin}
        actions={
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search site, customer, address…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      >
        {filtered.length ? (
          <DataGrid rows={filtered as any} columns={cols} onRowClick={(r: any) => setSelected(r)} />
        ) : (
          <EmptyState icon={MapPin} title="No locations yet" description="Addresses on customers, branches, Starlink kits, NAS units and assets appear here automatically." />
        )}
      </DetailCard>
    </PageShell>
  );
}

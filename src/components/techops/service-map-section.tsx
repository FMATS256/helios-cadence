import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DataGrid, StatusBadge, toneForStatus, type ColumnDef,
} from "@/components/enterprise";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MapPin, Search, Layers, X, PanelTop, PanelBottom, RefreshCw,
} from "lucide-react";
import { getServiceMap, type MapSite } from "@/lib/servicemap.functions";
import { KIND_COLOR } from "@/lib/service-map.shared";

const ServiceMapView = lazy(() => import("@/components/service-map-view"));


const KIND_LABEL: Record<string, string> = {
  customer: "Customer sites", branch: "Branches", starlink: "Starlink",
  nas: "Managed NAS", asset: "Deployed assets", stock: "Stock locations",
};

export function ServiceMapPage() {
  const qc = useQueryClient();
  const fetchMap = useServerFn(getServiceMap);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [selected, setSelected] = useState<MapSite | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
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

  const statChips = useMemo(() => [
    { label: "Total sites", value: stats?.total ?? 0, color: "#1F6BE0" },
    { label: "Mapped", value: stats?.located ?? 0, color: "#10B981" },
    { label: "Awaiting geocode", value: stats?.pending ?? 0, color: "#F59E0B" },
    { label: "Towns / cities", value: stats?.cities ?? 0, color: "#7C3AED" },
    { label: "Customer sites", value: stats?.customers ?? 0, color: "#0EA5E9" },
    { label: "Branches", value: stats?.branches ?? 0, color: "#6366F1" },
    { label: "Starlink", value: stats?.starlink ?? 0, color: "#0284C7" },
    { label: "Deployed assets", value: stats?.assets ?? 0, color: "#059669" },
  ], [stats]);

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
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden bg-muted">
      {/* Full-bleed map */}
      <div className="absolute inset-0 z-0">
        {mounted ? (
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
            <ServiceMapView sites={filtered} onSelect={setSelected} />
          </Suspense>
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>

      {/* Floating top header + stats */}
      <div className="absolute top-0 left-0 right-0 z-[400] p-4 pointer-events-none">
        <div className="flex flex-col gap-3 max-w-full">
          <div className="flex items-start justify-between gap-3 pointer-events-auto">
            <Card className="shadow-xl border-border/60 bg-background/90 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5 text-solar" />
                  Service Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Every location IMT has deployed, installed or serviced — plotted from live operational records.
                </p>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="shadow-lg bg-background/90 backdrop-blur-xl"
                onClick={() => qc.invalidateQueries({ queryKey: ["service-map"] })}
                disabled={q.isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="shadow-lg bg-background/90 backdrop-blur-xl"
                onClick={() => setShowFilters((v) => !v)}
              >
                <Layers className="h-4 w-4 mr-1.5" />
                {showFilters ? "Hide filters" : "Show filters"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="shadow-lg bg-background/90 backdrop-blur-xl"
                onClick={() => setShowTable((v) => !v)}
              >
                {showTable ? <PanelBottom className="h-4 w-4 mr-1.5" /> : <PanelTop className="h-4 w-4 mr-1.5" />}
                {showTable ? "Hide list" : "Show list"}
              </Button>
            </div>
          </div>

          {/* Stat chips row */}
          <div className="flex flex-wrap gap-2 pointer-events-auto">
            {statChips.map((chip, i) => (
              <div
                key={i}
                className="px-3 py-1.5 rounded-lg border border-white/20 shadow-lg backdrop-blur-xl text-white text-xs font-semibold"
                style={{ backgroundColor: `${chip.color}E6` }}
                
              >
                <span className="opacity-90 uppercase tracking-wider text-[10px]">{chip.label}</span>
                <span className="ml-2 font-display text-sm tabular-nums">{chip.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating left filters */}
      {showFilters && (
        <div className="absolute top-36 left-4 z-[400] w-64 pointer-events-auto">
          <Card className="shadow-xl border-border/60 bg-background/90 backdrop-blur-xl max-h-[calc(100vh-12rem)] overflow-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Filter by type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(KIND_LABEL).map(([k, label]) => {
                const count = sites.filter((s) => s.kind === k).length;
                const on = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(on ? "all" : k)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${on ? "border-solar bg-solar/10" : "hover:bg-muted"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: KIND_COLOR[k] }} />
                      {label}
                    </span>
                    <span className="font-mono text-xs">{count}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Floating right selected site panel */}
      {selected && (
        <div className="absolute top-36 right-4 z-[400] w-72 pointer-events-auto">
          <Card className="shadow-xl border-border/60 bg-background/90 backdrop-blur-xl">
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <CardTitle className="text-sm">Selected site</CardTitle>
              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-2" onClick={() => setSelected(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom locations sheet */}
      {showTable && (
        <div className="absolute bottom-0 left-0 right-0 z-[400] pointer-events-auto">
          <Card className="rounded-b-none border-b-0 shadow-2xl bg-background/95 backdrop-blur-xl max-h-[40vh] flex flex-col">
            <CardHeader className="pb-2 flex flex-row items-center justify-between border-b">
              <CardTitle className="text-sm">Locations ({filtered.length})</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-56">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-9" placeholder="Search site, customer, address…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTable(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto flex-1 p-0">
              {filtered.length ? (
                <DataGrid rows={filtered as any} columns={cols} onRowClick={(r: any) => setSelected(r)} />
              ) : (
                <div className="p-8 text-center">
                  <MapPin className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium">No locations yet</p>
                  <p className="text-xs text-muted-foreground">Addresses on customers, branches, Starlink kits, NAS units and assets appear here automatically.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

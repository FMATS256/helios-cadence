import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

const C = ["hsl(var(--primary))", "#16a34a", "#f59e0b", "#dc2626", "#0ea5e9", "#8b5cf6"];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

const count = (rows: any[], key: string) => {
  const m: Record<string, number> = {};
  rows.forEach((r) => { const k = r[key] || "unknown"; m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).map(([name, value]) => ({ name, value }));
};

export function summarizeResults(rows: { checked_at: string; response_ms: number | null; status: string }[]) {
  const buckets: Record<string, { ms: number[]; up: number; total: number }> = {};
  rows.forEach((r) => {
    const h = r.checked_at.slice(0, 13);
    const b = (buckets[h] ||= { ms: [], up: 0, total: 0 });
    b.total++;
    if (r.status === "up") b.up++;
    if (r.response_ms != null) b.ms.push(r.response_ms);
  });
  return Object.keys(buckets).sort().map((h) => {
    const b = buckets[h];
    const s = [...b.ms].sort((a, z) => a - z);
    const pct = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0);
    return { hour: h.slice(11) + ":00", p50: pct(0.5), p95: pct(0.95), uptime: b.total ? Math.round((b.up / b.total) * 1000) / 10 : 0 };
  });
}

async function load() {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const [res, checks, tickets, sec] = await Promise.all([
    supabase.from("monitoring_results").select("checked_at,response_ms,status").gte("checked_at", since).order("checked_at").limit(5000),
    supabase.from("monitoring_checks").select("status,check_type").is("archived_at", null),
    supabase.from("tickets").select("status,priority,created_at").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).limit(2000),
    supabase.from("security_incidents").select("severity,status,category,detected_at").limit(1000),
  ]);
  return { res: res.data ?? [], checks: checks.data ?? [], tickets: tickets.data ?? [], sec: sec.data ?? [] };
}

export function TelemetrySection() {
  const { data, isLoading } = useQuery({ queryKey: ["noc-telemetry"], queryFn: load, refetchInterval: 60_000 });
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading telemetry…</p>;
  const series = summarizeResults(data.res as any);
  const up = data.res.filter((r: any) => r.status === "up").length;
  const uptime = data.res.length ? ((up / data.res.length) * 100).toFixed(2) : "—";
  const avg = data.res.length ? Math.round(data.res.reduce((a: number, r: any) => a + (r.response_ms || 0), 0) / data.res.length) : 0;
  const down = data.checks.filter((c: any) => c.status === "down").length;
  const days: Record<string, { day: string; opened: number }> = {};
  data.tickets.forEach((t: any) => { const d = t.created_at.slice(5, 10); (days[d] ||= { day: d, opened: 0 }).opened++; });
  const ticketTrend = Object.values(days).sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="24h uptime" value={`${uptime}%`} tone={Number(uptime) < 99 ? "text-destructive" : "text-emerald-600"} />
        <Kpi label="Avg response" value={`${avg} ms`} />
        <Kpi label="Checks down" value={down} tone={down ? "text-destructive" : ""} />
        <Kpi label="Tickets (14d)" value={data.tickets.length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Response time (p50 / p95 ms, 24h)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
              <Line dataKey="p50" stroke={C[0]} dot={false} /><Line dataKey="p95" stroke={C[2]} dot={false} /></LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Uptime % per hour">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip />
              <Line dataKey="uptime" stroke={C[1]} dot={false} /></LineChart>
          </ResponsiveContainer>
        </Card>
        <PieCard title="Check status" data={count(data.checks, "status")} />
        <PieCard title="Checks by type" data={count(data.checks, "check_type")} />
        <Card title="Tickets opened per day (14d)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ticketTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip />
              <Bar dataKey="opened" fill={C[0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <PieCard title="Tickets by priority" data={count(data.tickets, "priority")} />
      </div>
    </div>
  );
}

function PieCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <Card title={title}>
      {data.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">No data yet</p> : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} label>
            {data.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function SocDashboard() {
  const { data } = useQuery({ queryKey: ["noc-telemetry"], queryFn: load, refetchInterval: 60_000 });
  if (!data) return null;
  const open = data.sec.filter((s: any) => !["resolved", "closed"].includes(s.status));
  const crit = open.filter((s: any) => ["critical", "high"].includes(s.severity)).length;
  return (
    <div className="mb-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open security incidents" value={open.length} tone={open.length ? "text-amber-600" : ""} />
        <Kpi label="Critical / high open" value={crit} tone={crit ? "text-destructive" : "text-emerald-600"} />
        <Kpi label="Total incidents" value={data.sec.length} />
        <Kpi label="Threat level" value={crit ? "Elevated" : open.length ? "Guarded" : "Low"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <PieCard title="By severity" data={count(data.sec, "severity")} />
        <PieCard title="By category" data={count(data.sec, "category")} />
        <PieCard title="By status" data={count(data.sec, "status")} />
      </div>
    </div>
  );
}

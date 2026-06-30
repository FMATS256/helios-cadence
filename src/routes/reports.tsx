import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { revenueSeries, sourceSeries, pipelineSeries } from "@/mock/data";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports & Analytics — RoyEno CRM" }, { name: "description", content: "Revenue, conversion, and operational analytics." }] }),
  component: () => (
    <PageContainer>
      <PageHeader eyebrow="Growth" title="Reports & Analytics" description="Revenue trends, conversion funnel, lead sources, and team performance." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="font-display">Revenue (7 mo)</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenueSeries}>
              <defs><linearGradient id="r2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.72 0.18 48)" stopOpacity={0.5} /><stop offset="100%" stopColor="oklch(0.72 0.18 48)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 255)" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} /><YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} /><Tooltip />
              <Area type="monotone" dataKey="revenue" stroke="oklch(0.72 0.18 48)" strokeWidth={2.5} fill="url(#r2)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="font-display">Pipeline by stage</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipelineSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 255)" />
              <XAxis dataKey="stage" fontSize={11} tickLine={false} axisLine={false} /><YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} /><Tooltip />
              <Bar dataKey="value" fill="oklch(0.22 0.09 265)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="font-display">Lead sources (last 30 days)</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={sourceSeries} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
                {sourceSeries.map((_, i) => <Cell key={i} fill={["oklch(0.72 0.18 48)","oklch(0.22 0.09 265)","oklch(0.65 0.16 150)","oklch(0.6 0.16 240)","oklch(0.78 0.14 80)","oklch(0.55 0.18 300)"][i]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>
    </PageContainer>
  ),
});

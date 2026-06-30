import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — RoyEno CRM" }, { name: "description", content: "Organization, users, integrations, and branding." }] }),
  component: () => (
    <PageContainer>
      <PageHeader eyebrow="Growth" title="Settings" description="Organization, users, roles, integrations, and branding." />
      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">Organization</TabsTrigger>
          <TabsTrigger value="team">Team & roles</TabsTrigger>
          <TabsTrigger value="integ">Integrations</TabsTrigger>
          <TabsTrigger value="brand">Branding</TabsTrigger>
        </TabsList>
        <TabsContent value="org" className="mt-4">
          <Card><CardHeader><CardTitle className="font-display">Organization details</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4">
            <div><Label>Company name</Label><Input defaultValue="RoyEno Solartech" className="mt-1.5" /></div>
            <div><Label>Country</Label><Input defaultValue="Zimbabwe" className="mt-1.5" /></div>
            <div><Label>Currency</Label><Input defaultValue="USD" className="mt-1.5" /></div>
            <div><Label>Timezone</Label><Input defaultValue="Africa/Harare (UTC+2)" className="mt-1.5" /></div>
            <div className="col-span-2"><Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>Save changes</Button></div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="team" className="mt-4"><Card><CardContent className="p-6 text-sm text-muted-foreground">Roles: Sales Agent, Technician, Supervisor, Finance, Admin. Phase 2 — wire to Lovable Cloud auth.</CardContent></Card></TabsContent>
        <TabsContent value="integ" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {["3CX PBX","WhatsApp Business API","Solar monitoring (SolarMan/Deye)","AI Lead Scoring","Mobile App Sync","Email & SMTP"].map((i) => (
              <Card key={i}><CardContent className="p-5 flex items-center justify-between">
                <div><p className="font-semibold">{i}</p><p className="text-xs text-muted-foreground mt-0.5">Coming soon</p></div>
                <Switch />
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="brand" className="mt-4"><Card><CardContent className="p-6 text-sm text-muted-foreground">Logo, colors, email templates, invoice branding — coming soon.</CardContent></Card></TabsContent>
      </Tabs>
    </PageContainer>
  ),
});

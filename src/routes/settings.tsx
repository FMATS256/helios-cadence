import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — IMT Operations" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, displayName } = useAuth();
  const { roles } = useRoles();
  return (
    <PageContainer>
      <PageHeader eyebrow="System" title="My settings" description="Profile, security, and personal preferences." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-6 space-y-4">
          <h3 className="font-display font-semibold">Profile</h3>
          <div className="space-y-2"><Label>Display name</Label><Input defaultValue={displayName} /></div>
          <div className="space-y-2"><Label>Email</Label><Input defaultValue={user?.email ?? ""} disabled /></div>
          <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>Save</Button>
        </CardContent></Card>
        <Card><CardContent className="p-6 space-y-4">
          <h3 className="font-display font-semibold">Roles</h3>
          <p className="text-sm text-muted-foreground">Your access level on this platform.</p>
          <div className="flex flex-wrap gap-2">
            {roles.length === 0 ? <span className="text-sm text-muted-foreground">No roles assigned. Contact your Master Administrator.</span>
              : roles.map((r) => <Badge key={r} variant="secondary">{r.replace(/_/g, " ")}</Badge>)}
          </div>
        </CardContent></Card>
        <Card className="lg:col-span-2"><CardContent className="p-6 space-y-2">
          <h3 className="font-display font-semibold">Security</h3>
          <p className="text-sm text-muted-foreground">Multi-factor authentication, IP allowlists, and session controls — coming in Phase 2.</p>
        </CardContent></Card>
      </div>
    </PageContainer>
  );
}

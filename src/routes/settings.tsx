import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — IMT Operations" },
      { name: "description", content: "Manage your IMT Operations profile, password and session security." },
      { property: "og:title", content: "Settings — IMT Operations" },
      { property: "og:description", content: "Manage your IMT Operations profile, password and session security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, displayName } = useAuth();
  const { roles } = useRoles();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });

  const [form, setForm] = useState({ full_name: "", phone: "", department: "" });
  useEffect(() => {
    setForm({
      full_name: (profile as any)?.full_name ?? displayName ?? "",
      phone: (profile as any)?.phone ?? "",
      department: (profile as any)?.department ?? "",
    });
  }, [profile, displayName]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!form.full_name.trim()) throw new Error("Display name is required");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          department: form.department.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      await supabase.auth.updateUser({ data: { full_name: form.full_name.trim() } });
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [pw, setPw] = useState({ next: "", confirm: "" });
  const changePassword = useMutation({
    mutationFn: async () => {
      if (pw.next.length < 8) throw new Error("Password must be at least 8 characters");
      if (pw.next !== pw.confirm) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password: pw.next });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPw({ next: "", confirm: "" });
      toast.success("Password changed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const signOutEverywhere = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Signed out of all devices"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader eyebrow="System" title="My settings" description="Profile, security, and personal preferences." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-6 space-y-4">
          <h3 className="font-display font-semibold">Profile</h3>
          <div className="space-y-2"><Label>Display name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="space-y-2"><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+263 …" />
            </div>
            <div className="space-y-2"><Label>Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Operations" />
            </div>
          </div>
          <Button
            className="text-solar-foreground"
            style={{ background: "var(--gradient-solar)" }}
            disabled={saveProfile.isPending}
            onClick={() => saveProfile.mutate()}
          >
            {saveProfile.isPending ? "Saving…" : "Save"}
          </Button>
        </CardContent></Card>

        <Card><CardContent className="p-6 space-y-4">
          <h3 className="font-display font-semibold">Roles</h3>
          <p className="text-sm text-muted-foreground">Your access level on this platform.</p>
          <div className="flex flex-wrap gap-2">
            {roles.length === 0 ? <span className="text-sm text-muted-foreground">No roles assigned. Contact your Master Administrator.</span>
              : roles.map((r) => <Badge key={r} variant="secondary">{r.replace(/_/g, " ")}</Badge>)}
          </div>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardContent className="p-6 space-y-4">
          <h3 className="font-display font-semibold">Security</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2"><Label>New password</Label>
              <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <div className="space-y-2"><Label>Confirm new password</Label>
              <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={changePassword.isPending} onClick={() => changePassword.mutate()}>
              {changePassword.isPending ? "Updating…" : "Change password"}
            </Button>
            <Button variant="ghost" className="text-destructive" disabled={signOutEverywhere.isPending} onClick={() => signOutEverywhere.mutate()}>
              Sign out of all devices
            </Button>
          </div>
        </CardContent></Card>
      </div>
    </PageContainer>
  );
}

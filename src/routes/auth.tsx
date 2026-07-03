import imtLogo from "@/assets/imt-logo.png.asset.json";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — IMT Operations Platform" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/" });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) goNext(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    goNext();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const redirect = next ? `${window.location.origin}${next}` : `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirect, data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — signing you in");
    goNext();
  };

  const handleGoogle = async () => {
    setBusy(true);
    const redirect = next ? `${window.location.origin}${next}` : window.location.origin;
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirect });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    if (!res.redirected) goNext();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex flex-col items-center justify-center mb-8 gap-3">
          <img src={imtLogo.url} alt="IMT Solutions" className="h-16 w-16 object-contain" />
          <div className="text-center">
            <div className="font-display text-xl font-bold">IMT Operations Platform</div>
            <div className="text-xs uppercase tracking-[3px] text-muted-foreground mt-1">Single source of truth</div>
          </div>
        </Link>

        <Card className="p-6">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="si-email">Email</Label><Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="si-pw">Password</Label><Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" disabled={busy} className="w-full text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{busy ? "Signing in…" : "Sign in"}</Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="su-name">Full name</Label><Input id="su-name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="su-email">Email</Label><Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="su-pw">Password</Label><Input id="su-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" disabled={busy} className="w-full text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{busy ? "Creating…" : "Create account"}</Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" /><span className="text-xs uppercase tracking-widest text-muted-foreground">or</span><div className="flex-1 h-px bg-border" />
          </div>
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={handleGoogle}>
            Continue with Google
          </Button>
          <p className="text-[11px] text-muted-foreground mt-4 text-center">First account becomes Master Administrator automatically.</p>
        </Card>
      </div>
    </div>
  );
}

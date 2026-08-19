import imtLogo from "@/assets/imt-logo.png.asset.json";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { ensureMasterAdmin } from "@/lib/bootstrap.functions";
import { KeyRound, LifeBuoy, Server, ShieldCheck } from "lucide-react";


export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — IMT Operations Platform" }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined;
    return next ? { next } : {};
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [master, setMaster] = useState<{ email: string; ready: boolean } | null>(null);
  const bootstrap = useServerFn(ensureMasterAdmin);

  const goNext = () => { if (next) window.location.href = next; else navigate({ to: "/" }); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) goNext(); });
    bootstrap().then(setMaster).catch(() => {});
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


  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Reset link sent — check your inbox");
    setMode("signin");
  };

  const fillMaster = () => {
    if (!master) return;
    setEmail(master.email);
  };


  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Left — welcome panel */}
      <aside
        className="relative hidden overflow-hidden text-navy-foreground p-8 lg:p-12 lg:flex flex-col justify-between lg:min-h-screen"
        style={{ background: "var(--gradient-navy)" }}
      >
        {/* Decorative blobs */}
        <div
          className="absolute -top-24 -left-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--gradient-solar)" }}
        />
        <div
          className="absolute bottom-0 right-0 h-96 w-96 rounded-full opacity-25 blur-3xl translate-x-1/3 translate-y-1/3"
          style={{ background: "radial-gradient(circle, var(--solar-glow), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <img src={imtLogo.url} alt="IMT Solutions" className="h-11 w-11 object-contain" />
          <div>
            <div className="font-display font-bold text-lg leading-none">IMT Solutions</div>
            <div className="text-[10px] uppercase tracking-[3px] text-navy-foreground/70 mt-1">Operations Platform</div>
          </div>
        </div>

        <div className="relative">
          <p className="text-xs uppercase tracking-[4px] text-solar font-semibold mb-4">Welcome</p>
          <h1 className="font-display text-4xl lg:text-5xl font-bold leading-tight">
            The single source of truth for your entire operation.
          </h1>
          <p className="mt-4 text-navy-foreground/70 text-sm lg:text-base max-w-md">
            Customers, cloud services, tickets, credentials, monitoring and billing —
            unified under one immutable M-number per customer.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 max-w-md">
            {[
              { icon: LifeBuoy, label: "Support Desk" },
              { icon: KeyRound, label: "Credential Vault" },
              { icon: Server, label: "Live Monitoring" },
              { icon: ShieldCheck, label: "RBAC & Audit" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 backdrop-blur-sm">
                <div className="h-8 w-8 rounded-lg bg-solar/20 text-solar flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative hidden lg:flex items-center gap-2 text-xs text-navy-foreground/50">
          <span>© {new Date().getFullYear()} IMT Solutions</span>
          <span aria-hidden>·</span>
          <span>All systems encrypted</span>
        </div>
      </aside>

      {/* Right — sign in card */}
      <main className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-8 lg:hidden">
            <img src={imtLogo.url} alt="IMT" className="h-10 w-10 object-contain" />
          </div>

          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">
                {mode === "signin" ? "Sign In" : "Reset Password"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "signin"
                  ? "Please log in to continue to your account"
                  : "We'll email you a secure reset link"}
              </p>
            </div>
            {mode !== "signin" && (
              <Button variant="ghost" size="sm" onClick={() => setMode("signin")}>Back</Button>
            )}
          </div>

          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="si-email">Email</Label>
                <Input id="si-email" type="email" required autoComplete="email"
                  placeholder="you@company.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="si-pw">Password</Label>
                <Input id="si-pw" type="password" required autoComplete="current-password"
                  placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                  <Checkbox id="remember" />
                  <span>Keep me logged in</span>
                </label>
                <button type="button" onClick={() => setMode("reset")} className="text-solar font-medium hover:underline">
                  Forgot password?
                </button>
              </div>

              <Button type="submit" disabled={busy}
                className="w-full h-11 text-solar-foreground text-base font-semibold shadow-lg"
                style={{ background: "var(--gradient-solar)" }}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>

              {master?.ready && (
                <div className="rounded-xl border border-solar/30 bg-solar/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-widest font-semibold text-solar">Master Administrator</p>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={fillMaster}>
                      Use email
                    </Button>
                  </div>
                  <div className="text-xs text-foreground/80 space-y-1 break-all">
                    <div><span className="text-muted-foreground">email:</span> <span className="font-mono">{master.email}</span></div>
                    <div className="text-muted-foreground">Master access is ready. Enter the secure password you provided.</div>
                  </div>
                </div>
              )}


              <p className="text-[11px] text-center text-muted-foreground pt-2">
                Access is invite-only. Contact your Master Administrator to be onboarded.
              </p>
            </form>
          )}



          {mode === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rs-email">Email</Label>
                <Input id="rs-email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
              </div>
              <Button type="submit" disabled={busy}
                className="w-full h-11 text-solar-foreground text-base font-semibold shadow-lg"
                style={{ background: "var(--gradient-solar)" }}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}


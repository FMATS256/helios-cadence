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
import { ArrowRight, Eye, EyeOff, KeyRound, LifeBuoy, LockKeyhole, Mail, Server, ShieldCheck } from "lucide-react";


export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — IMT Operations Platform" }, { name: "description", content: "Sign in securely to your IMT account." }, { property: "og:title", content: "Sign in — IMT Operations Platform" }, { property: "og:description", content: "Secure access to IMT Solutions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
  const [showPassword, setShowPassword] = useState(false);
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
      redirectTo: `${window.location.origin}/reset-password`,
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
    <div className="auth-page min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <header className="auth-mobile-header lg:hidden">
        <div className="flex items-center gap-3">
          <div className="auth-mobile-logo"><img src={imtLogo.url} alt="" className="h-10 w-10 object-contain" /></div>
          <div>
            <p className="font-display text-2xl font-bold">IMT Solutions</p>
            <p className="mt-1 text-sm text-navy-foreground/75">Operations Platform</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-navy-foreground/80"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Secure account access</div>
      </header>
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
      <main className="auth-main flex min-h-screen flex-col justify-center px-5 py-8 sm:p-10 lg:p-12 lg:min-h-0 lg:items-center">
        <div className="auth-form-container w-full max-w-md mx-auto">
          {/* Mobile brand bar */}
          <div
            className="mb-6 hidden items-center gap-3 rounded-2xl px-4 py-3.5 text-navy-foreground shadow-[var(--shadow-elegant)]"
            style={{ background: "var(--gradient-navy)" }}
          >
            <img src={imtLogo.url} alt="IMT Solutions" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="font-display text-sm font-bold leading-none truncate">IMT Solutions</div>
              <div className="mt-1 text-[9px] uppercase tracking-[2.5px] text-navy-foreground/70">Operations Platform</div>
            </div>
          </div>

          <div className="auth-heading flex items-start justify-between gap-3 mb-6 sm:mb-8">
            <div className="min-w-0">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
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
                <div className="auth-input-wrap relative">
                <Mail className="auth-field-icon hidden" aria-hidden="true" />
                <Input id="si-email" type="email" required autoComplete="email"
                  placeholder="you@company.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="si-pw">Password</Label>
                <div className="auth-input-wrap relative">
                <LockKeyhole className="auth-field-icon hidden" aria-hidden="true" />
                <Input id="si-pw" type={showPassword ? "text" : "password"} required autoComplete="current-password"
                  placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 text-base" />
                <Button type="button" variant="ghost" size="icon" className="auth-password-toggle absolute right-1 top-1 hidden" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                </div>
              </div>

              <div className="auth-options flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                  <Checkbox id="remember" />
                  <span>Keep me logged in</span>
                </label>
                <Button type="button" variant="link" onClick={() => setMode("reset")} className="auth-reset-link h-auto p-0 text-solar font-medium hover:underline">
                  Forgot password?
                </Button>
              </div>

              <Button type="submit" disabled={busy}
                className="auth-submit w-full h-11 text-solar-foreground text-base font-semibold shadow-lg"
                style={{ background: "var(--gradient-solar)" }}>
                {busy ? "Signing in…" : "Sign in"}
                {!busy && <ArrowRight className="ml-1 h-4 w-4 lg:hidden" aria-hidden="true" />}
              </Button>

              {master?.ready && (
                <div className="hidden lg:block rounded-xl border border-solar/30 bg-solar/5 p-3 space-y-2">
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


              <p className="auth-invite-note text-[11px] text-center text-muted-foreground pt-2">
                Access is invite-only. Contact your Master Administrator to be onboarded.
              </p>
            </form>
          )}



          {mode === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rs-email">Email</Label>
                <Input id="rs-email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base" />
              </div>
              <Button type="submit" disabled={busy}
                className="auth-submit w-full h-11 text-solar-foreground text-base font-semibold shadow-lg"
                style={{ background: "var(--gradient-solar)" }}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
        </div>
        <footer className="auth-mobile-footer lg:hidden">© {new Date().getFullYear()} IMT Solutions</footer>
      </main>
    </div>
  );
}


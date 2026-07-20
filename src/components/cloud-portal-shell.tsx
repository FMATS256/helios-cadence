import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Cloud, LayoutDashboard, Server, Users, Receipt, LifeBuoy, ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import imtLogo from "@/assets/imt-logo.png.asset.json";

export interface WorkspaceCtx {
  workspace: { id: string; name: string; slug: string; workspace_key: string };
  myRole: "owner" | "admin" | "developer" | "viewer" | null;
  isStaff: boolean;
}

export function CloudPortalShell({ ctx, children }: { ctx: WorkspaceCtx; children: React.ReactNode }) {
  const base = `/c/${ctx.workspace.slug}/${ctx.workspace.workspace_key}`;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = [
    { label: "Overview", to: base, icon: LayoutDashboard, exact: true },
    { label: "Servers", to: `${base}/servers`, icon: Server },
    { label: "Team", to: `${base}/team`, icon: Users },
    { label: "Billing", to: `${base}/billing`, icon: Receipt },
    { label: "Support", to: `${base}/support`, icon: LifeBuoy },
    { label: "Activity", to: `${base}/activity`, icon: ShieldAlert },
  ];
  const { displayName } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center gap-6 px-4 md:px-8 h-16">
          <div className="flex items-center gap-2">
            <img src={imtLogo.url} alt="IMT Cloud" className="h-9 w-9 object-contain" />
            <div className="hidden sm:block leading-tight">
              <div className="font-display font-bold text-sm flex items-center gap-2">
                <Cloud className="h-3.5 w-3.5 text-solar" /> IMT Cloud
              </div>
              <div className="text-[10px] tracking-[2px] text-muted-foreground">{ctx.workspace.name.toUpperCase()}</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 ml-auto overflow-x-auto">
            {nav.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition whitespace-nowrap ${active ? "bg-navy text-navy-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                  <n.icon className="h-4 w-4" />
                  <span className="hidden md:inline">{n.label}</span>
                </Link>
              );
            })}
            {ctx.isStaff && <Badge variant="outline" className="ml-2 border-solar/60 text-solar hidden md:inline-flex">IMT staff override</Badge>}
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2"><LogOut className="h-4 w-4 md:mr-1.5" /><span className="hidden md:inline">Sign out</span></Button>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <p className="text-xs text-muted-foreground mb-6">
          Signed in as <span className="font-semibold text-foreground">{displayName}</span>
          {ctx.myRole && <> · role <span className="capitalize font-semibold text-foreground">{ctx.myRole}</span></>}
        </p>
        {children}
      </main>
    </div>
  );
}

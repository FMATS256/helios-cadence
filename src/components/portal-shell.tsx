import imtLogo from "@/assets/imt-logo.png.asset.json";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, LifeBuoy, Receipt, Server, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePortal } from "@/hooks/use-portal";

const nav = [
  { title: "Overview", url: "/portal", icon: LayoutDashboard, exact: true },
  { title: "My Tickets", url: "/portal/tickets", icon: LifeBuoy },
  { title: "My Invoices", url: "/portal/invoices", icon: Receipt },
  { title: "My Assets", url: "/portal/assets", icon: Server },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { displayName } = useAuth();
  const { customer } = usePortal();
  const navigate = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center gap-6 px-4 md:px-8 h-16">
          <div className="flex items-center gap-2">
            <img src={imtLogo.url} alt="IMT" className="h-9 w-9 object-contain" />
            <div className="hidden sm:block leading-tight">
              <div className="font-display font-bold text-sm">Customer Portal</div>
              <div className="text-[10px] tracking-[2px] text-muted-foreground">{customer?.account_number ?? ""} · {customer?.company_name ?? ""}</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 ml-auto">
            {nav.map((n) => {
              const active = n.exact ? pathname === n.url : pathname.startsWith(n.url);
              return (
                <Link key={n.url} to={n.url} className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition ${active ? "bg-navy text-navy-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                  <n.icon className="h-4 w-4" />
                  <span className="hidden md:inline">{n.title}</span>
                </Link>
              );
            })}
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2"><LogOut className="h-4 w-4 md:mr-1.5" /><span className="hidden md:inline">Sign out</span></Button>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <p className="text-xs text-muted-foreground mb-6">Signed in as <span className="font-semibold text-foreground">{displayName}</span></p>
        {children}
      </main>
    </div>
  );
}

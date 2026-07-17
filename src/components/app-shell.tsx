import imtLogo from "@/assets/imt-logo.png.asset.json";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, KeyRound, LifeBuoy, Cloud, Server, Activity, Receipt, FolderKanban,
  Warehouse, BarChart3, Bell, Settings, Shield, Plus, ChevronDown,
  FileText, CreditCard, Repeat, BookOpen, Laptop, PhoneCall, Satellite,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarProvider, SidebarTrigger, SidebarInset,
} from "@/components/ui/sidebar";
import { GlobalSearchTrigger } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

const navGroups = [
  {
    label: "Operations",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Customers", url: "/customers", icon: Users },
      { title: "Support Desk", url: "/tickets", icon: LifeBuoy },
      { title: "Credential Vault", url: "/credentials", icon: KeyRound },
    ],
  },
  {
    label: "Services",
    items: [
      { title: "Cloud Ops", url: "/cloud-ops", icon: Cloud },
      { title: "Managed Services", url: "/cloud", icon: Server },
      { title: "Starlink", url: "/starlink", icon: Satellite },
      { title: "Service Pages", url: "/services", icon: BookOpen },
      { title: "Assets", url: "/assets", icon: Server },
      { title: "Laptop Tracking", url: "/laptop-tracking", icon: Laptop },
      { title: "VoIP", url: "/voip", icon: PhoneCall },
      { title: "Monitoring", url: "/monitoring", icon: Activity },
      { title: "Projects", url: "/projects", icon: FolderKanban },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Quotes", url: "/quotes", icon: FileText },
      { title: "Billing", url: "/billing", icon: Receipt },
      { title: "Payments", url: "/payments", icon: CreditCard },
      { title: "Subscriptions", url: "/subscriptions", icon: Repeat },
      { title: "Inventory", url: "/inventory", icon: Warehouse },
      { title: "Reports", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Knowledge Base", url: "/knowledge", icon: BookOpen },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Master Admin", url: "/admin", icon: Shield, masterOnly: true },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
] as const;

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMaster } = useRoles();
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <img
            src={imtLogo.url}
            alt="IMT Solutions"
            className="h-11 w-11 shrink-0 object-contain group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9"
          />
          <div className="group-data-[collapsible=icon]:hidden min-w-0">
            <div className="font-display text-sm font-bold text-sidebar-foreground leading-none truncate">IMT Solutions</div>
            <div className="text-[10px] tracking-[2px] text-sidebar-foreground/60 mt-1">OPERATIONS PLATFORM</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] tracking-widest font-semibold uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.filter((i: any) => !i.masterOnly || isMaster).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url} className="gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
        <div className="rounded-xl bg-sidebar-accent/40 p-3">
          <p className="text-solar text-sm font-semibold">Single source of truth</p>
          <p className="text-xs text-sidebar-foreground/60 mt-1">IMT OPS · v1.0</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-4 border-b border-border bg-background/80 backdrop-blur-xl px-3 sm:px-6">
      <SidebarTrigger className="text-foreground shrink-0" />
      <GlobalSearchTrigger />
      <div className="flex items-center gap-1.5 sm:gap-3 ml-auto shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-10 px-3 sm:px-4 text-solar-foreground border-0 shadow-[var(--shadow-glow)]" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">New</span><ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Create</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/customers">New Customer</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/payments">Record Payment</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/starlink">New Starlink Account</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/cloud">New Managed Service</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/tickets">New Ticket</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/credentials">New Credential</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="relative h-10 w-10" asChild>
          <Link to="/notifications">
            <Bell className="h-5 w-5" />
            <Badge className="absolute -top-0.5 -right-0.5 h-5 min-w-5 p-0 flex items-center justify-center bg-solar text-solar-foreground border-2 border-background">0</Badge>
          </Link>
        </Button>

        <UserChip />
      </div>
    </header>
  );
}

function UserChip() {
  const { user, displayName } = useAuth();
  const { roles } = useRoles();
  const navigate = useNavigate();
  const initials = displayName.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
  const handleSignOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  const primaryRole = roles[0]?.replace(/_/g, " ") ?? "no role";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 pl-3 border-l border-border h-10 cursor-pointer">
          <Avatar className="h-9 w-9 border-2 border-solar/40">
            <AvatarFallback className="bg-navy text-navy-foreground font-semibold text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden md:block leading-tight text-left">
            <p className="text-sm font-semibold text-foreground truncate max-w-[160px]">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[160px] capitalize">{primaryRole}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{displayName}</div>
          <div className="text-xs font-normal text-muted-foreground truncate">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/settings">My settings</Link></DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

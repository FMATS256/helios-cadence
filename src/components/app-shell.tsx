import imtLogo from "@/assets/imt-logo.png.asset.json";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Zap } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, KeyRound, LifeBuoy, Cloud, Server, Activity, Receipt, FolderKanban,
  Warehouse, BarChart3, Bell, Settings, Shield, Plus, ChevronDown, Package,
  FileText, CreditCard, Repeat, BookOpen, Laptop, PhoneCall, Satellite,
  Globe, HardDrive, Database, ShieldCheck, ShoppingCart, MessageSquare, Mail, Wallet, Banknote, MapPin, Target, Wrench,
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

type NavLeaf = { title: string; url: string; icon: any; masterOnly?: boolean };
type NavNode = NavLeaf & { children?: NavLeaf[] };

const siteNav: NavNode[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Packages", url: "/catalog", icon: Package },
  {
    title: "Services", url: "/cloud-ops", icon: Server,
    children: [
      { title: "Cloud Ops", url: "/cloud-ops", icon: Cloud },
      { title: "Managed Services", url: "/cloud", icon: Server },
      { title: "Starlink", url: "/starlink", icon: Satellite },
      { title: "Web Hosting", url: "/web-hosting", icon: Globe },
      { title: "Storage & NAS", url: "/cloud-storage", icon: HardDrive },
      { title: "VoIP", url: "/voip", icon: PhoneCall },
      { title: "Work Orders", url: "/work-orders", icon: Wrench },
    ],
  },
  {
    title: "Network", url: "/monitoring", icon: Activity,
    children: [
      { title: "NOC Command Centre", url: "/noc", icon: ShieldCheck },
      { title: "Monitoring", url: "/monitoring", icon: Activity },
      { title: "Service Map", url: "/service-map", icon: MapPin },
    ],
  },
  {
    title: "Finance", url: "/finance", icon: Wallet,
    children: [
      { title: "Finance Workspace", url: "/finance", icon: Wallet },
      { title: "Expenses & Cash", url: "/expenses", icon: Banknote },
      { title: "Procurement & Vendors", url: "/procurement", icon: ShoppingCart },
    ],
  },
  {
    title: "CRM", url: "/leads", icon: MessageSquare,
    children: [
      { title: "Leads", url: "/leads", icon: Target },
      { title: "Quotations", url: "/quotes", icon: FileText },
      { title: "Communications", url: "/communications", icon: MessageSquare },
      { title: "Projects", url: "/projects", icon: FolderKanban },
      { title: "Knowledge Base", url: "/knowledge", icon: BookOpen },
    ],
  },
  { title: "Tickets", url: "/tickets", icon: LifeBuoy },
  {
    title: "Inventory & Assets", url: "/inventory", icon: Warehouse,
    children: [
      { title: "Inventory & Assets", url: "/inventory", icon: Warehouse },
      { title: "Mini POS", url: "/pos", icon: ShoppingCart },
    ],
  },

  { title: "Reports", url: "/reports", icon: BarChart3 },
  {
    title: "Tools", url: "/automation", icon: Zap,
    children: [
      { title: "Automation", url: "/automation", icon: Zap },
      { title: "Credential Vault", url: "/credentials", icon: KeyRound },
      { title: "Notifications", url: "/notifications", icon: Bell },
    ],
  },
];

const configNav: NavNode[] = [
  { title: "Config", url: "/settings", icon: Settings },
  { title: "Email Studio", url: "/email-studio", icon: Mail, masterOnly: true },
  { title: "Permissions", url: "/admin", icon: Shield, masterOnly: true },
];

function NavSection({
  label, nodes, isActive, isMaster,
}: { label: string; nodes: NavNode[]; isActive: (u: string) => boolean; isMaster: boolean }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/45 text-[10px] tracking-[2px] font-semibold uppercase">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {nodes.filter((n) => !n.masterOnly || isMaster).map((node) =>
            node.children ? (
              <NavParent key={node.title} node={node} isActive={isActive} />
            ) : (
              <SidebarMenuItem key={node.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(node.url)}
                  tooltip={node.title}
                  className="h-10 rounded-lg data-[active=true]:bg-solar/15 data-[active=true]:text-solar data-[active=true]:font-semibold"
                >
                  <Link to={node.url} className="gap-3">
                    <node.icon className="h-4 w-4" />
                    <span>{node.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavParent({ node, isActive }: { node: NavNode; isActive: (u: string) => boolean }) {
  const childActive = (node.children ?? []).some((c) => isActive(c.url));
  const [open, setOpen] = useState(childActive);
  useEffect(() => { if (childActive) setOpen(true); }, [childActive]);

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={childActive && !open}
            tooltip={node.title}
            className="h-10 rounded-lg data-[active=true]:bg-solar/15 data-[active=true]:text-solar"
          >
            <node.icon className="h-4 w-4" />
            <span>{node.title}</span>
            <ChevronDown className={`ml-auto h-3.5 w-3.5 opacity-60 transition-transform ${open ? "" : "-rotate-90"}`} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
          <div className="ml-[1.15rem] mt-0.5 border-l border-sidebar-border pl-2 space-y-0.5">
            {(node.children ?? []).map((c) => (
              <Link
                key={c.title + c.url}
                to={c.url}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  isActive(c.url)
                    ? "bg-solar/15 text-solar font-semibold"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <c.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
              </Link>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

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
        <NavSection label="Site Navigation" nodes={siteNav} isActive={isActive} isMaster={isMaster} />
        <NavSection label="Config Navigation" nodes={configNav} isActive={isActive} isMaster={isMaster} />
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
            <DropdownMenuItem asChild><Link to="/finance" search={{ tab: "payments" }}>Record Payment</Link></DropdownMenuItem>
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

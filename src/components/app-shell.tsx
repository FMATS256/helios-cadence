import imtLogo from "@/assets/imt-logo.png.asset.json";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bot, Zap } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, KeyRound, LifeBuoy, Cloud, Server, Activity, Receipt, FolderKanban,
  Warehouse, BarChart3, Bell, Settings, Shield, Plus, ChevronDown, Package,
  FileText, CreditCard, Repeat, BookOpen, Laptop, PhoneCall, Satellite,
  Globe, HardDrive, Database, ShieldCheck, ShoppingCart, MessageSquare, Mail, Wallet, Banknote, MapPin, Target, Wrench,
  PackageCheck, Siren, Inbox,
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
import { can } from "@/lib/rbac";
import { canOpenPage, isNocWorkstation } from "@/lib/department-access";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

type NavLeaf = { title: string; url: string; icon: any; masterOnly?: boolean; search?: Record<string, string> };
type NavNode = NavLeaf & { children?: NavLeaf[] };

const siteNav: NavNode[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Client Portal", url: "/client/access", icon: ShieldCheck, masterOnly: true },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Packages", url: "/catalog", icon: Package },
  {
    title: "Services", url: "/cloud-ops", icon: Server,
    children: [
      { title: "Managed Cloud", url: "/managed-cloud", icon: Cloud },
      { title: "Starlink", url: "/starlink", icon: Satellite },
      { title: "Cloud & VPS Ops", url: "/cloud-ops", icon: Cloud },
      { title: "Web Hosting", url: "/web-hosting", icon: Globe },
      { title: "Storage & NAS", url: "/cloud-storage", icon: HardDrive },
      { title: "VoIP", url: "/voip", icon: PhoneCall },
      { title: "Sophos", url: "/sophos", icon: ShieldCheck },
      { title: "Veeam", url: "/veeam", icon: ShieldCheck },
      { title: "Kaspersky", url: "/kaspersky", icon: ShieldCheck },
      { title: "Microsoft 365", url: "/microsoft-365", icon: ShieldCheck },
      { title: "Zoho", url: "/zoho", icon: ShieldCheck },

    ],
  },
  { title: "NOC Command", url: "/noc", icon: ShieldCheck },
  { title: "Field TechOps", url: "/techops/dashboard", icon: Wrench },
  {
    title: "Finance", url: "/finance", icon: Wallet,
    children: [
      { title: "Finance Workspace", url: "/finance", icon: Wallet },
      { title: "Finance AI Agent", url: "/finance-agent", icon: Bot },
      { title: "Payments & Receivables", url: "/payments", icon: Receipt },
      { title: "Payment Submissions", url: "/payments", icon: Receipt, search: { tab: "submissions" } },
      { title: "Expenses & Cash", url: "/expenses", icon: Banknote },
      { title: "Procurement & Vendors", url: "/procurement", icon: ShoppingCart },
    ],
  },
  {
    title: "CRM", url: "/leads", icon: MessageSquare,
    children: [
      { title: "Leads & Accounts", url: "/leads", icon: Target },
      { title: "Account Manager", url: "/account-manager", icon: Users },
      { title: "Email Inbox", url: "/inbox", icon: Inbox },
      { title: "Personal Assistant", url: "/assistant", icon: Bot },
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
      { title: "Credential Vault", url: "/techops/vault", icon: KeyRound },
      { title: "Notifications", url: "/notifications", icon: Bell },
    ],
  },
];

// Engineer workstation menu — shown only to NOC/technical accounts.
const nocNav: NavNode[] = [
  { title: "Command Centre", url: "/", icon: LayoutDashboard },
  { title: "NOC Command", url: "/noc", icon: ShieldCheck },
  { title: "Customer 360", url: "/customers", icon: Users },
  {
    title: "Service Fleet", url: "/cloud-ops", icon: Server,
    children: [
      { title: "Starlink Fleet", url: "/starlink", icon: Satellite },
      { title: "Cloud & VPS Ops", url: "/cloud-ops", icon: Cloud },
      { title: "Web & Email Hosting", url: "/web-hosting", icon: Globe },
      { title: "Storage & NAS", url: "/cloud-storage", icon: HardDrive },
      { title: "VoIP & SIP", url: "/voip", icon: PhoneCall },
      { title: "Sophos", url: "/sophos", icon: ShieldCheck },
      { title: "Veeam", url: "/veeam", icon: ShieldCheck },
      { title: "Kaspersky", url: "/kaspersky", icon: ShieldCheck },
      { title: "Microsoft 365", url: "/microsoft-365", icon: ShieldCheck },
      { title: "Zoho", url: "/zoho", icon: ShieldCheck },
      { title: "Managed Cloud", url: "/managed-cloud", icon: Cloud },
    ],
  },
  {
    title: "Tickets & Field Ops", url: "/tickets", icon: LifeBuoy,
    children: [
      { title: "Tickets", url: "/tickets", icon: LifeBuoy },
      { title: "Field TechOps", url: "/techops/dashboard", icon: Wrench },
    ],
  },
  {
    title: "Tools & Vault", url: "/techops/vault", icon: KeyRound,
    children: [
      { title: "Credential Vault", url: "/techops/vault", icon: KeyRound },
      { title: "Client Password Reset", url: "/reset-password", icon: Shield },
      { title: "Notifications", url: "/notifications", icon: Bell },
    ],
  },
  {
    title: "Documentation", url: "/knowledge", icon: BookOpen,
    children: [
      { title: "Knowledge Base", url: "/knowledge", icon: BookOpen },
      { title: "Hardware Inventory", url: "/inventory", icon: Warehouse },
      { title: "Email Inbox", url: "/inbox", icon: Inbox },
    ],
  },
];

const configNav: NavNode[] = [
  { title: "Config", url: "/settings", icon: Settings },
  { title: "Email Studio", url: "/email-studio", icon: Mail, masterOnly: true },
  { title: "Permissions", url: "/admin", icon: Shield, masterOnly: true },
];

function NavSection({
  label, nodes, isActive, isMaster, roles,
}: { label: string; nodes: NavNode[]; isActive: (u: string) => boolean; isMaster: boolean; roles: string[] }) {
  const visible = nodes
    .filter((n) => !n.masterOnly || isMaster)
    .map((n) => (n.children ? { ...n, children: n.children.filter((c) => canOpenPage(c.url, roles)) } : n))
    .filter((n) => (n.children ? n.children.length > 0 : canOpenPage(n.url, roles)));
  if (!visible.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/45 text-[10px] tracking-[2px] font-semibold uppercase">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {visible.map((node) =>
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
                search={(c.search ?? {}) as any}
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
  const { isMaster, roles } = useRoles();
  const noc = isNocWorkstation(roles);
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
            <div className="text-[10px] tracking-[2px] text-sidebar-foreground/60 mt-1">{noc ? "ENGINEER WORKSTATION" : "OPERATIONS PLATFORM"}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        {noc ? (
          <NavSection label="Technical Operations" nodes={nocNav} isActive={isActive} isMaster={isMaster} roles={roles} />
        ) : (
          <>
            <NavSection label="Site Navigation" nodes={siteNav} isActive={isActive} isMaster={isMaster} roles={roles} />
            <NavSection label="Config Navigation" nodes={configNav} isActive={isActive} isMaster={isMaster} roles={roles} />
          </>
        )}
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
  const { roles } = useRoles();
  // Separation of duties: only billing records payments or raises invoices.
  const canRecord = can(roles, "payments.record");
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
            {canRecord ? (
              <DropdownMenuItem asChild><Link to="/finance" search={{ tab: "payments" }}>Record Payment</Link></DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild><Link to="/payments" search={{ tab: "submissions" }}>Submit Payment to Billing</Link></DropdownMenuItem>
            )}
            <DropdownMenuItem asChild><Link to="/starlink">New Starlink Account</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/cloud-ops">New Managed Service</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/tickets">New Ticket</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/techops/vault">New Credential</Link></DropdownMenuItem>
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
      <SidebarInset className="bg-background min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto"><PageGuard>{children}</PageGuard></main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function PageGuard({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, loading } = useRoles();
  if (loading) return <>{children}</>;
  if (canOpenPage(pathname, roles)) return <>{children}</>;
  return (
    <div className="p-8 max-w-lg mx-auto text-center space-y-3">
      <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
      <h1 className="font-display text-xl font-semibold">Not available for your role</h1>
      <p className="text-sm text-muted-foreground">This page belongs to another department. Ask an administrator if you need access.</p>
      <Button asChild variant="outline"><Link to="/">Back to dashboard</Link></Button>
    </div>
  );
}

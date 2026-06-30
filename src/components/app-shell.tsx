import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, UserCircle2, Contact2, GitBranch, FileText, FileSignature,
  HardHat, Package, ListChecks, CalendarDays, FolderOpen, Receipt, Wallet,
  BarChart3, Megaphone, Bell, Settings, Sun, Plus, Search, ChevronDown, Plug, Sparkles,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarProvider, SidebarTrigger, SidebarInset,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import royenoLogo from "@/assets/royeno-logo.jpeg.asset.json";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Getting Started", url: "/getting-started", icon: Sparkles },
      { title: "Sales Pipeline", url: "/pipeline", icon: GitBranch },
      { title: "Tasks", url: "/tasks", icon: ListChecks },
      { title: "Calendar", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Sales",
    items: [
      { title: "Leads", url: "/leads", icon: Users },
      { title: "Clients", url: "/clients", icon: UserCircle2 },
      { title: "Contacts", url: "/contacts", icon: Contact2 },
      { title: "Quotes", url: "/quotes", icon: FileText },
      { title: "Proposals", url: "/proposals", icon: FileSignature },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Installations", url: "/installations", icon: HardHat },
      { title: "Products & Systems", url: "/products", icon: Package },
      { title: "Documents", url: "/documents", icon: FolderOpen },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Invoices", url: "/invoices", icon: Receipt },
      { title: "Payments", url: "/payments", icon: Wallet },
      { title: "Zoho Books", url: "/zoho", icon: Plug },
    ],
  },
  {
    label: "Growth",
    items: [
      { title: "Reports & Analytics", url: "/reports", icon: BarChart3 },
      { title: "Marketing", url: "/marketing", icon: Megaphone },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <img
            src={royenoLogo.url}
            alt="Royeno Solartech"
            className="h-11 w-auto shrink-0 rounded-lg object-contain bg-[#F39200] p-1 group-data-[collapsible=icon]:h-9"
          />
          <div className="group-data-[collapsible=icon]:hidden min-w-0">
            <div className="font-display text-sm font-bold text-solar leading-none truncate">Royeno Solartech</div>
            <div className="text-[10px] tracking-[2px] text-sidebar-foreground/60 mt-1">CRM SUITE</div>
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
                {group.items.map((item) => (
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
          <p className="text-solar text-sm font-semibold">Powering a brighter future</p>
          <p className="text-xs text-sidebar-foreground/60 mt-1">v2.6 · Enterprise</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-xl px-6">
      <SidebarTrigger className="text-foreground" />
      <div className="relative flex-1 max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads, clients, systems, invoices..."
          className="pl-10 h-10 bg-muted/50 border-transparent focus-visible:bg-background"
        />
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-10 px-4 text-solar-foreground border-0 shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-solar)" }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New
              <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Create</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/leads">New Lead</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/clients">New Client</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/quotes">New Quote</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/invoices">New Invoice</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/payments">Record Payment</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/installations">Schedule Installation</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/tasks">New Task</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="relative h-10 w-10" asChild>
          <Link to="/notifications">
            <Bell className="h-5 w-5" />
            <Badge className="absolute -top-0.5 -right-0.5 h-5 min-w-5 p-0 flex items-center justify-center bg-solar text-solar-foreground border-2 border-background">
              3
            </Badge>
          </Link>
        </Button>

        <UserChip />
      </div>
    </header>
  );
}

function UserChip() {
  const { user, displayName } = useAuth();
  const navigate = useNavigate();
  const initials =
    displayName
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 pl-3 border-l border-border h-10 cursor-pointer">
          <Avatar className="h-9 w-9 border-2 border-solar/40">
            <AvatarFallback className="bg-navy text-navy-foreground font-semibold text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden md:block leading-tight text-left">
            <p className="text-sm font-semibold text-foreground truncate max-w-[160px]">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{user?.email}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{displayName}</div>
          <div className="text-xs font-normal text-muted-foreground truncate">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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

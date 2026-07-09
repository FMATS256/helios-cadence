import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter,
  HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { PortalShell } from "@/components/portal-shell";
import { useAuth } from "@/hooks/use-auth";
import { usePortal } from "@/hooks/use-portal";
import { useNavigate, useRouterState } from "@tanstack/react-router";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end. You can try refreshing or head back home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Try again</button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dashboard — IMT Operations Platform" },
      { name: "description", content: "Role-tailored command center: finance, account management, and support." },
      { property: "og:title", content: "Dashboard — IMT Operations Platform" },
      { property: "og:description", content: "Role-tailored command center: finance, account management, and support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Dashboard — IMT Operations Platform" },
      { name: "twitter:description", content: "Role-tailored command center: finance, account management, and support." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3fec914d-25e4-4a04-8d2a-fb9133929293/id-preview-f6564763--c44632e7-4e60-424d-92dc-77876dacb52f.lovable.app-1783098489453.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3fec914d-25e4-4a04-8d2a-fb9133929293/id-preview-f6564763--c44632e7-4e60-424d-92dc-77876dacb52f.lovable.app-1783098489453.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const navigate = useNavigate();
  const isConsent = pathname === "/.lovable/oauth/consent";
  const isPortalRoute = pathname === "/portal" || pathname.startsWith("/portal/");
  const { isPortal } = usePortal();

  useEffect(() => {
    if (!loading && !user && pathname !== "/auth") {
      const next = pathname + (search ?? "");
      navigate({ to: "/auth", search: { next } as any });
    }
  }, [user, loading, pathname, search, navigate]);

  // Portal users are redirected out of the staff app
  useEffect(() => {
    if (!loading && user && isPortal && !isPortalRoute && pathname !== "/auth") {
      navigate({ to: "/portal" });
    }
  }, [loading, user, isPortal, isPortalRoute, pathname, navigate]);

  if (pathname === "/auth") return <Outlet />;
  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (isConsent) return <Outlet />;
  if (isPortalRoute) return <PortalShell><Outlet /></PortalShell>;
  return <AppShell><Outlet /></AppShell>;
}

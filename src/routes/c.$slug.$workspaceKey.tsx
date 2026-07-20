import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceContext } from "@/lib/portal.functions";
import { CloudPortalShell } from "@/components/cloud-portal-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/c/$slug/$workspaceKey")({
  component: Layout,
});

function Layout() {
  const { slug, workspaceKey } = Route.useParams();
  const { user, loading } = useAuth();
  const fn = useServerFn(getWorkspaceContext);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ws-ctx", slug, workspaceKey, user?.id],
    queryFn: () => fn({ data: { slug, workspaceKey } }),
    enabled: !!user,
    retry: false,
  });

  if (loading || (user && isLoading)) return <FullScreen>Loading workspace…</FullScreen>;
  if (!user) return (
    <FullScreen>
      <div className="text-center space-y-3">
        <p className="text-lg font-semibold">Sign in to access this workspace</p>
        <Link to="/auth" search={{ redirect: `/c/${slug}/${workspaceKey}` } as any} className="text-solar underline">Go to sign in</Link>
      </div>
    </FullScreen>
  );
  if (error || !data) return (
    <FullScreen>
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold">Workspace unavailable</p>
        <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? "You do not have access to this workspace."}</p>
      </div>
    </FullScreen>
  );

  const ctx = data as any;
  return (
    <CloudPortalShell ctx={ctx}>
      <Outlet />
    </CloudPortalShell>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background p-8">{children}</div>;
}

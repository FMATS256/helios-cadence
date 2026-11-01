import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { myRoles, type AppRole } from "@/lib/admin.functions";
import { useAuth } from "./use-auth";

export function useRoles() {
  const { user } = useAuth();
  const fn = useServerFn(myRoles);
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: () => fn(),
    enabled: !!user,
  });
  const has = (r: AppRole) => data.includes(r);
  const isMaster = has("master_admin");
  const isStaff = data.length > 0;
  return { roles: data as AppRole[], has, isMaster, isStaff, loading: !!user && isLoading };
}

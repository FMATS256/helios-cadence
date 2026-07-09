import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export function usePortal() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["portal-link", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("customer_id, customers:customer_id(id,account_number,company_name)")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const customer = (data as any)?.customers ?? null;
  return { isPortal: !!customer, customer };
}

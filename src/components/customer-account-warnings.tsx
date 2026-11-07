import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { accountWarnings } from "@/lib/customer360/account-status";
import { Button } from "@/components/ui/button";

export function CustomerAccountWarnings({ view, onNavigate }: { view: Record<string, any>; onNavigate: (tab: string) => void }) {
  const { user } = useAuth();
  const licenses = useQuery({
    queryKey: ["client-licenses", view.customer.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_licenses").select("*").eq("customer_id", view.customer.id).order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const warnings = accountWarnings(view, licenses.data ?? []);
  if (!warnings.length && !licenses.isError) return null;
  return <section role="alert" aria-label="Account warnings" className="border-l-4 border-destructive bg-destructive/5 px-4 py-3 text-destructive">
    <h2 className="flex items-center gap-2 font-semibold text-sm"><ShieldAlert className="h-4 w-4 shrink-0" />Account needs attention</h2>
    <ul className="mt-2 divide-y divide-destructive/15">
      {warnings.map(warning => <li key={warning.key} className="flex items-start justify-between gap-3 py-2 text-sm"><span className="min-w-0 break-words">{warning.message}</span><Button size="sm" variant="ghost" className="shrink-0 h-7 text-destructive" onClick={() => onNavigate(warning.tab)} aria-label={`Review ${warning.message}`}>Review<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></li>)}
      {licenses.isError && <li className="py-2 text-sm">Licence information could not be checked.</li>}
    </ul>
  </section>;
}
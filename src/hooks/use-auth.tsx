import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async (u: User | null) => {
      if (!u) return setFullName(null);
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", u.id)
        .maybeSingle();
      setFullName(
        data?.full_name ??
          (u.user_metadata?.full_name as string | undefined) ??
          null,
      );
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      void loadProfile(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      void loadProfile(s?.user ?? null).finally(() => setLoading(false));
    });
    return () => subscription.unsubscribe();
  }, []);

  const displayName =
    fullName ||
    (user?.email
      ? user.email
          .split("@")[0]
          .replace(/[._]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Account");

  return { session, user, loading, fullName, displayName };
}

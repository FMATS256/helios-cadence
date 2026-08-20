import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Module-level auth store. The session is resolved once per browser tab and
 * shared by every consumer, so remounts and route changes never replay the
 * "Checking your session…" gate or re-fetch the profile.
 */
type AuthSnapshot = {
  session: Session | null;
  user: User | null;
  fullName: string | null;
  loading: boolean;
};

let snapshot: AuthSnapshot = { session: null, user: null, fullName: null, loading: true };
const listeners = new Set<(s: AuthSnapshot) => void>();
let started = false;

function set(patch: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l(snapshot));
}

async function loadProfile(u: User | null) {
  if (!u) return set({ fullName: null });
  // Optimistic name from the JWT so the shell renders immediately.
  set({ fullName: (u.user_metadata?.full_name as string | undefined) ?? snapshot.fullName ?? null });
  const { data } = await supabase.from("profiles").select("full_name").eq("id", u.id).maybeSingle();
  if (data?.full_name) set({ fullName: data.full_name });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  let lastUserId: string | null | undefined = undefined;
  const apply = (s: Session | null) => {
    const uid = s?.user?.id ?? null;
    set({ session: s, user: s?.user ?? null, loading: false });
    if (uid !== lastUserId) {
      lastUserId = uid;
      void loadProfile(s?.user ?? null);
    }
  };

  supabase.auth.onAuthStateChange((_evt, s) => apply(s));

  // getSession() reads local storage first; resolve fast and never hang.
  supabase.auth
    .getSession()
    .then(({ data: { session: s } }) => apply(s))
    .catch(() => apply(null));

  setTimeout(() => {
    if (snapshot.loading) set({ loading: false });
  }, 2500);
}

export function useAuth() {
  const [state, setState] = useState<AuthSnapshot>(snapshot);

  useEffect(() => {
    start();
    listeners.add(setState);
    setState(snapshot);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const displayName =
    state.fullName ||
    (state.user?.email
      ? state.user.email
          .split("@")[0]
          .replace(/[._]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Account");

  return { session: state.session, user: state.user, loading: state.loading, fullName: state.fullName, displayName };
}

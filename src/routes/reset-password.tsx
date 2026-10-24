import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/imt-logo.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — IMT Solutions" }, { name: "description", content: "Securely reset your IMT client account password." }, { property: "og:title", content: "Reset password — IMT Solutions" }, { property: "og:description", content: "Secure IMT account password recovery." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: ResetPassword,
});
function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") !== "recovery") return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active && data.session) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => { if (event === "PASSWORD_RECOVERY" && session && active) setReady(true); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return <main className="max-w-md mx-auto px-5 py-16 space-y-6"><img src={logo.url} className="h-14 w-14 object-contain" alt="IMT Solutions" /><h1 className="text-2xl font-semibold">Reset your password</h1>{done ? <><p>Password updated.</p><Button asChild><Link to="/client">Open your account</Link></Button></> : ready ? <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (password !== confirmation) return toast.error("Passwords do not match"); setBusy(true); const { error } = await supabase.auth.updateUser({ password }); setBusy(false); if (error) toast.error(error.message); else setDone(true); }}><div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div><Button disabled={busy}>{busy ? "Saving…" : "Save password"}</Button></form> : <><p className="text-muted-foreground">Open the recovery link from your email to continue.</p><Button variant="outline" asChild><Link to="/client">Back to sign-in</Link></Button></>}</main>;
}
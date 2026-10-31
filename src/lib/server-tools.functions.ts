// Staff server tools: power, real provider snapshots, and approval-gated
// rebuild / restore / app install. Destructive actions are only queued here;
// an operations manager or master admin (not the requester) runs them.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serverApp, type ApprovalAction } from "./server-apps";

const VULTR = "https://api.vultr.com/v2";
async function vultr<T = any>(path: string, init?: RequestInit): Promise<T> {
  const k = process.env.VULTR_API_KEY;
  if (!k) throw new Error("Vultr key not configured");
  const res = await fetch(`${VULTR}${path}`, {
    ...init, headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Vultr ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

async function staffServer(context: any, server_id: string) {
  const { assertStaff } = await import("./customer360.server");
  await assertStaff(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: srv } = await supabaseAdmin.from("cloud_servers").select("*").eq("id", server_id).single();
  if (!srv) throw new Error("Server not found");
  return { srv: srv as any, admin: supabaseAdmin };
}
function requireVultr(srv: any) {
  if (srv.provider !== "vultr") throw new Error(`${srv.provider} doesn't support this from IMT yet — use the provider's own panel.`);
  if (!srv.provider_server_id) throw new Error("No provider ID on this server record");
}

export const serverPower = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; action: "on" | "off" | "reboot" }) => {
    if (!["on", "off", "reboot"].includes(d?.action)) throw new Error("Invalid action");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { srv, admin } = await staffServer(context, data.server_id);
    if (!srv.provider_server_id) throw new Error("No provider ID on this server record");
    const { getProvider } = await import("./providers/registry.server");
    await getProvider(srv.provider).powerAction(srv.provider_server_id, data.action);
    await admin.from("cloud_servers").update({
      power_state: data.action === "off" ? "stopping" : data.action === "on" ? "starting" : "rebooting",
    }).eq("id", srv.id);
    await admin.from("cloud_activity").insert({ server_id: srv.id, action: `power.${data.action}`, detail: { by: context.userId } as any });
    return { ok: true };
  });

export const listProviderSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { srv, admin } = await staffServer(context, data.server_id);
    const { data: rows } = await admin.from("server_backups").select("*").eq("server_id", srv.id)
      .not("provider_snapshot_id", "is", null).neq("status", "deleted").order("created_at", { ascending: false });
    if (srv.provider !== "vultr") return { supported: false, snapshots: rows ?? [] };
    // Refresh status of pending snapshots from Vultr.
    for (const r of rows ?? []) {
      if (r.status !== "pending") continue;
      try {
        const s = await vultr<any>(`/snapshots/${r.provider_snapshot_id}`);
        const st = s.snapshot?.status === "complete" ? "completed" : "pending";
        if (st !== r.status) {
          await admin.from("server_backups").update({ status: st, size_gb: s.snapshot?.size ? Math.round(s.snapshot.size / 1e9) : null }).eq("id", r.id);
          r.status = st;
        }
      } catch { /* keep pending */ }
    }
    return { supported: true, snapshots: rows ?? [] };
  });

export const takeProviderSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const { srv, admin } = await staffServer(context, data.server_id);
    requireVultr(srv);
    const description = (data.notes || `IMT ${srv.name} ${new Date().toISOString().slice(0, 16)}`).slice(0, 120);
    const r = await vultr<any>("/snapshots", { method: "POST", body: JSON.stringify({ instance_id: srv.provider_server_id, description }) });
    const { data: row, error } = await admin.from("server_backups").insert({
      server_id: srv.id, provider: "vultr", kind: "snapshot", status: "pending",
      provider_snapshot_id: r.snapshot?.id, notes: description, created_by: context.userId, taken_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw new Error(error.message);
    await admin.from("cloud_activity").insert({ server_id: srv.id, action: "snapshot.provider_created", detail: { snapshot: r.snapshot?.id, by: context.userId } as any });
    return row;
  });

export const requestServerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; action: ApprovalAction; params?: { snapshot_id?: string; app?: string }; reason?: string }) => {
    if (!["rebuild", "restore_snapshot", "install_app"].includes(d?.action)) throw new Error("Invalid action");
    if (d.action === "restore_snapshot" && !d.params?.snapshot_id) throw new Error("Pick a snapshot to restore");
    if (d.action === "install_app" && !serverApp(d.params?.app ?? "")) throw new Error("Pick an app to install");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { srv, admin } = await staffServer(context, data.server_id);
    requireVultr(srv);
    const { data: open } = await admin.from("server_action_requests").select("id")
      .eq("server_id", srv.id).in("status", ["pending", "running"]).limit(1);
    if (open?.length) throw new Error("This server already has a request waiting — decide that one first.");
    const { data: row, error } = await admin.from("server_action_requests").insert({
      server_id: srv.id, action: data.action, params: (data.params ?? {}) as any,
      reason: data.reason?.slice(0, 500) ?? null, requested_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await admin.from("cloud_activity").insert({ server_id: srv.id, action: `request.${data.action}`, detail: { request: row.id, by: context.userId } as any });
    return row;
  });

export const decideServerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { request_id: string; decision: "approve" | "reject" }) => {
    if (!d?.request_id || !["approve", "reject"].includes(d.decision)) throw new Error("Invalid request");
    return d;
  })
  .handler(async ({ data, context }) => {
    const [ops, master] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations_manager" }),
      context.supabase.rpc("is_master_admin", { _user_id: context.userId }),
    ]);
    if (!ops.data && !master.data) throw new Error("Only operations managers or master admins can approve server actions.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: pre } = await admin.from("server_action_requests").select("requested_by").eq("id", data.request_id).maybeSingle();
    if (!pre) throw new Error("Request not found");
    if (pre.requested_by === context.userId && !master.data) throw new Error("You can't approve your own request — another manager must.");

    // Claim atomically so it runs once.
    const { data: req } = await admin.from("server_action_requests")
      .update({ status: data.decision === "approve" ? "running" : "rejected", decided_by: context.userId, decided_at: new Date().toISOString() })
      .eq("id", data.request_id).eq("status", "pending").select("*").maybeSingle();
    if (!req) throw new Error("This request is no longer waiting for approval.");
    if (data.decision === "reject") {
      await admin.from("cloud_activity").insert({ server_id: req.server_id, action: `request.${req.action}.rejected`, detail: { by: context.userId } as any });
      return { ok: true, status: "rejected" };
    }
    const { data: srv } = await admin.from("cloud_servers").select("*").eq("id", req.server_id).single();
    try {
      requireVultr(srv);
      const id = srv!.provider_server_id;
      const p = (req.params ?? {}) as any;
      if (req.action === "restore_snapshot") {
        const { data: bk } = await admin.from("server_backups").select("provider_snapshot_id").eq("id", p.snapshot_id).eq("server_id", srv!.id).maybeSingle();
        if (!bk?.provider_snapshot_id) throw new Error("Snapshot not found on this server");
        await vultr(`/instances/${id}/restore`, { method: "POST", body: JSON.stringify({ snapshot_id: bk.provider_snapshot_id }) });
      } else {
        if (req.action === "install_app") {
          const app = serverApp(p.app)!;
          const b64 = btoa(unescape(encodeURIComponent(app.script)));
          await vultr(`/instances/${id}`, { method: "PATCH", body: JSON.stringify({ user_data: b64 }) });
        }
        await vultr(`/instances/${id}/reinstall`, { method: "POST", body: JSON.stringify({ hostname: srv!.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase() }) });
      }
      await admin.from("server_action_requests").update({ status: "completed" }).eq("id", req.id);
      await admin.from("cloud_servers").update({ status: "provisioning", power_state: "rebooting" }).eq("id", srv!.id);
      await admin.from("cloud_activity").insert({ server_id: srv!.id, action: `request.${req.action}.approved`, detail: { by: context.userId, params: p } as any });
      return { ok: true, status: "completed" };
    } catch (e: any) {
      const message = e instanceof Error ? e.message : "Provider action failed";
      await admin.from("server_action_requests").update({ status: "failed", error: message }).eq("id", req.id);
      return { ok: false, status: "failed", error: message };
    }
  });

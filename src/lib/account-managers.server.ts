import { AM_PHONE, AM_ROLES, preferredRolesFor, type AmRole } from "./account-managers.shared";

export interface AmRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string;
  roles: AmRole[];
  role: AmRole;
  role_label: string;
  customer_count: number;
}

/** Every staff member holding any account-manager role, with live portfolio size. */
export async function listAccountManagerRecords(db: any): Promise<AmRecord[]> {
  const [{ data: roleRows }, { data: customers }] = await Promise.all([
    db.from("user_roles").select("user_id, role").in("role", AM_ROLES as unknown as string[]),
    db.from("customers").select("account_manager_id").is("archived_at", null),
  ]);

  const byUser = new Map<string, AmRole[]>();
  for (const r of roleRows ?? []) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.role as AmRole);
    byUser.set(r.user_id, list);
  }
  const ids = [...byUser.keys()];
  if (!ids.length) return [];

  const { data: profiles } = await db
    .from("profiles").select("id, full_name, email, status").in("id", ids);

  const counts = new Map<string, number>();
  for (const c of customers ?? []) {
    if (c.account_manager_id) counts.set(c.account_manager_id, (counts.get(c.account_manager_id) ?? 0) + 1);
  }

  const { AM_ROLE_LABEL } = await import("./account-managers.shared");

  return (profiles ?? [])
    .filter((p: any) => (p.status ?? "active") !== "inactive")
    .map((p: any) => {
      const roles = (byUser.get(p.id) ?? []).sort(
        (a, b) => AM_ROLES.indexOf(a) - AM_ROLES.indexOf(b),
      );
      const role = roles[0] ?? "account_manager";
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: AM_PHONE,
        roles,
        role,
        role_label: AM_ROLE_LABEL[role as AmRole] ?? "Account Manager",
        customer_count: counts.get(p.id) ?? 0,
      } as AmRecord;
    })
    .sort((a: AmRecord, b: AmRecord) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
}

/**
 * Decide who owns a newly created customer.
 * 1. Explicit pick (must actually hold an AM role).
 * 2. The creator, when they are an account manager — they own what they create.
 * 3. Otherwise (e.g. master admin created it) the least-loaded manager whose
 *    category matches the account type.
 */
export async function resolveAccountManager(
  db: any,
  opts: { explicitId?: string | null; creatorId: string; accountType?: string | null },
): Promise<AmRecord | null> {
  const managers = await listAccountManagerRecords(db);
  if (!managers.length) return null;

  if (opts.explicitId) {
    const picked = managers.find((m) => m.id === opts.explicitId);
    if (!picked) throw new Error("Selected account manager does not hold an account-manager role");
    return picked;
  }

  const self = managers.find((m) => m.id === opts.creatorId);
  if (self) return self;

  for (const role of preferredRolesFor(opts.accountType)) {
    const pool = managers.filter((m) => m.roles.includes(role));
    if (pool.length) {
      return pool.sort((a, b) => a.customer_count - b.customer_count)[0]!;
    }
  }
  return managers.sort((a, b) => a.customer_count - b.customer_count)[0]!;
}

/** Contact block used in customer-facing emails. */
export async function accountManagerContact(db: any, managerId?: string | null) {
  if (!managerId) return null;
  const { data } = await db
    .from("profiles").select("id, full_name, email").eq("id", managerId).maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.full_name as string | null, email: data.email as string | null, phone: AM_PHONE };
}

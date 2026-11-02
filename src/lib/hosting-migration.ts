/** Client-safe hosting migration workflow model (stored on the hosting account's notes). */
export const MIGRATION_STAGES = [
  { key: "requested", label: "Requested", hint: "Collect old host login or backup from the client." },
  { key: "backup_received", label: "Backup received", hint: "Full cPanel backup, IMAP logins or site files are in hand." },
  { key: "target_created", label: "Account created", hint: "cPanel account provisioned on the IMT server." },
  { key: "data_restored", label: "Data restored", hint: "Files, databases and mailboxes restored / IMAP synced." },
  { key: "dns_pending", label: "DNS cutover", hint: "Client updates nameservers or A/MX records to IMT." },
  { key: "completed", label: "Completed", hint: "DNS points to IMT and the client confirmed mail and site work." },
] as const;
export type MigrationStage = (typeof MIGRATION_STAGES)[number]["key"];
export type MigrationType = "cpanel_full" | "imap_email" | "manual_web";

export const MIGRATION_TYPES: Record<MigrationType, { label: string; steps: string[] }> = {
  cpanel_full: {
    label: "Full cPanel move",
    steps: [
      "Old cPanel → Backup → Download a Full Account Backup (or ask the old host for a cpmove file).",
      "WHM → Transfers → Restore a Full Backup/cpmove File, using the username shown here.",
      "Mail passwords, forwarders and databases come across unchanged.",
    ],
  },
  imap_email: {
    label: "Email only (IMAP sync)",
    steps: [
      "Create each mailbox on the IMT account with a temporary password.",
      "Run imapsync from the old IMAP server to mail.<domain> for every mailbox.",
      "Run a final sync after MX cutover to catch late messages.",
    ],
  },
  manual_web: {
    label: "Website files + database",
    steps: [
      "Export the database (phpMyAdmin/SQL dump) and zip public_html from the old host.",
      "Upload via File Manager/FTP, create the database and import the dump.",
      "Update the site config (e.g. wp-config.php) with the new database details.",
    ],
  },
};

export type MigrationMeta = {
  type: MigrationType;
  stage: MigrationStage;
  source_provider?: string | null;
  old_ip?: string | null;
  mailboxes?: string[];
  history: { stage: MigrationStage; at: string; note?: string | null }[];
  dns?: { checked_at: string; a: string[]; mx: string[]; ns: string[]; points_to_imt: boolean } | null;
};

const TAG = "[imt-migration]";
export function readMigration(notes: string | null | undefined): MigrationMeta | null {
  if (!notes) return null;
  const i = notes.indexOf(TAG);
  if (i < 0) return null;
  try { return JSON.parse(notes.slice(i + TAG.length)); } catch { return null; }
}
export function writeMigration(notes: string | null | undefined, meta: MigrationMeta): string {
  const base = (notes ?? "").split(TAG)[0].trimEnd();
  return `${base ? base + "\n" : ""}${TAG}${JSON.stringify(meta)}`;
}
export function stageIndex(s: MigrationStage) { return MIGRATION_STAGES.findIndex((x) => x.key === s); }
export function nextStage(s: MigrationStage): MigrationStage | null {
  const i = stageIndex(s);
  return i >= 0 && i < MIGRATION_STAGES.length - 1 ? MIGRATION_STAGES[i + 1].key : null;
}
/** DNS points to IMT when any A record matches the server IP or NS mention the IMT server host. */
export function pointsToImt(a: string[], ns: string[], serverIp: string | null, serverHost: string | null) {
  if (serverIp && a.includes(serverIp)) return true;
  const host = (serverHost ?? "").toLowerCase().split(".").slice(-2).join(".");
  return !!host && ns.some((n) => n.toLowerCase().includes(host));
}

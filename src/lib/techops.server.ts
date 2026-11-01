// Server-only helpers for the Technical Operations workspace.
// Job = a row in public.service_tasks plus its requirement / equipment /
// checklist / photo / sign-off children.

export const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  installation: [
    "Confirm site access and on-site contact",
    "Site survey and cable route agreed",
    "Mount and power primary equipment",
    "Terminate and label all cabling",
    "Configure device IP / VLAN settings",
    "Test link throughput and latency",
    "Test failover / backup path",
    "Walk the customer through the setup",
    "Capture customer sign-off",
  ],
  deployment: [
    "Confirm specification against the order",
    "Provision the service with the provider",
    "Apply base configuration and hardening",
    "Configure DNS / networking",
    "Verify service reachability",
    "Record credentials in the vault",
    "Hand over details to the customer",
  ],
  site_visit: [
    "Confirm appointment with the customer",
    "Inspect reported fault",
    "Perform corrective work",
    "Verify service restored",
    "Capture customer sign-off",
  ],
  maintenance: [
    "Notify customer of maintenance window",
    "Take a backup / snapshot before changes",
    "Apply maintenance work",
    "Verify service health after change",
    "Close out and notify customer",
  ],
  configuration: [
    "Review requested configuration",
    "Apply configuration",
    "Test the change",
    "Document the change",
  ],
  migration: [
    "Take a full backup of the source",
    "Prepare the destination environment",
    "Run the migration",
    "Verify data integrity",
    "Cut over and update DNS",
    "Decommission the source",
  ],
  decommission: [
    "Confirm decommission approval",
    "Take a final backup",
    "Recover equipment from site",
    "Disable service with the provider",
    "Update asset and inventory records",
  ],
  number_provisioning: [
    "Confirm number range with the carrier",
    "Create SIP account and extension",
    "Register the handset / softphone",
    "Place a test call in and out",
    "Send credentials to the customer",
  ],
};

export function checklistFor(taskType: string): string[] {
  return CHECKLIST_TEMPLATES[taskType] ?? CHECKLIST_TEMPLATES.installation!;
}

/** Load a job with every child collection in a single round of queries. */
export async function loadJob(client: any, id: string) {
  const { data: job, error } = await client
    .from("service_tasks")
    .select("*, customer:customers(id, account_number, company_name, email:primary_email, phone:primary_phone, title)")
    .eq("id", id)
    .single();
  if (error || !job) throw new Error(error?.message ?? "Job not found");

  const [requirements, equipment, checklist, photos, signoffs] = await Promise.all([
    client.from("job_requirements").select("*").eq("task_id", id).order("created_at"),
    client.from("job_equipment").select("*, item:inventory_items(id, name, sku, quantity)").eq("task_id", id).order("created_at"),
    client.from("job_checklist").select("*").eq("task_id", id).order("position"),
    client.from("job_photos").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    client.from("job_signoffs").select("*").eq("task_id", id).order("signed_at", { ascending: false }),
  ]);

  return {
    job,
    requirements: requirements.data ?? [],
    equipment: equipment.data ?? [],
    checklist: checklist.data ?? [],
    photos: photos.data ?? [],
    signoffs: signoffs.data ?? [],
  };
}

/** Signed URLs for private job photos (1 hour). */
export async function signPhotoUrls(admin: any, photos: any[]) {
  const out: any[] = [];
  for (const p of photos) {
    const { data } = await admin.storage.from("job-photos").createSignedUrl(p.storage_path, 60);
    out.push({ ...p, url: data?.signedUrl ?? null });
  }
  return out;
}

/** Match a free-text requirement against sellable stock. */
export function matchStock(label: string, items: any[]) {
  const needle = label.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let best: any = null;
  let bestScore = 0;
  for (const it of items) {
    const hay = `${it.name} ${it.sku} ${it.category ?? ""} ${it.description ?? ""}`.toLowerCase();
    const score = needle.reduce((acc, w) => (w.length > 2 && hay.includes(w) ? acc + 1 : acc), 0);
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore > 0 ? best : null;
}

/** Build the plain-text completion report body for a finished job. */
export function buildCompletionReport(payload: {
  job: any;
  checklist: any[];
  equipment: any[];
  signoff: any | null;
}) {
  const { job, checklist, equipment, signoff } = payload;
  const lines: string[] = [];
  lines.push(`Job: ${job.title}`);
  lines.push(`Reference: ${job.id.slice(0, 8).toUpperCase()}`);
  lines.push(`Type: ${job.task_type} · ${job.service_type}`);
  if (job.site_name || job.site_address) lines.push(`Site: ${[job.site_name, job.site_address].filter(Boolean).join(" — ")}`);
  lines.push(`Completed: ${new Date(job.completed_at ?? Date.now()).toLocaleString()}`);
  if (checklist.length) {
    lines.push("");
    lines.push("Work completed:");
    for (const c of checklist) lines.push(`  ${c.done ? "[x]" : "[ ]"} ${c.label}`);
  }
  const installed = equipment.filter((e) => ["installed", "issued"].includes(e.status));
  if (installed.length) {
    lines.push("");
    lines.push("Equipment installed:");
    for (const e of installed) lines.push(`  - ${e.quantity} x ${e.description}${e.serial_numbers ? ` (S/N ${e.serial_numbers})` : ""}`);
  }
  if (job.network_config) { lines.push(""); lines.push("Network configuration:"); lines.push(job.network_config); }
  if (job.testing_notes) { lines.push(""); lines.push("Testing:"); lines.push(job.testing_notes); }
  if (job.installation_notes) { lines.push(""); lines.push("Engineer notes:"); lines.push(job.installation_notes); }
  if (signoff) {
    lines.push("");
    lines.push(`Signed off by ${signoff.signed_by_name}${signoff.signed_by_role ? ` (${signoff.signed_by_role})` : ""} on ${new Date(signoff.signed_at).toLocaleString()}`);
  }
  return lines.join("\n");
}

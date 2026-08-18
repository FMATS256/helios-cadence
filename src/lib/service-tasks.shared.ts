export const TASK_STATUSES = ["pending", "assigned", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TYPES = [
  { value: "deployment", label: "Server / service deployment" },
  { value: "number_provisioning", label: "VoIP number provisioning" },
  { value: "installation", label: "On-site installation" },
  { value: "configuration", label: "Configuration / setup" },
  { value: "migration", label: "Migration" },
  { value: "maintenance", label: "Maintenance" },
  { value: "decommission", label: "Decommission" },
  { value: "site_visit", label: "Site visit" },
];

export const SERVICE_TYPES = [
  { value: "cloud", label: "Cloud / VPS" },
  { value: "voip", label: "VoIP" },
  { value: "hosting", label: "Web hosting" },
  { value: "starlink", label: "Starlink" },
  { value: "storage", label: "Storage / NAS" },
  { value: "network", label: "Network" },
  { value: "hardware", label: "Hardware / assets" },
  { value: "general", label: "General" },
];

export const LEAD_STATUSES = [
  "new", "contacted", "qualified", "proposal", "negotiation", "won", "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Provider-agnostic types for the Cloud Provisioning Agent.

export type ProviderName =
  | "kamatera"
  | "hetzner"
  | "digitalocean"
  | "vultr"
  | "contabo"
  | "aws"
  | "azure"
  | "gcp";

export type ResourceKind =
  | "vm"
  | "kubernetes"
  | "docker_host"
  | "container"
  | "block_storage"
  | "object_storage"
  | "load_balancer"
  | "network"
  | "firewall"
  | "floating_ip"
  | "vpn"
  | "backup"
  | "database"
  | "dns_zone"
  | "ssl_certificate";

export type OsFamily = "ubuntu" | "debian" | "almalinux" | "rocky" | "windows";

export interface Region {
  id: string;
  name: string;
  country?: string;
  city?: string;
}

export interface InstanceType {
  id: string;
  cpu_cores: number;
  ram_mb: number;
  disk_gb: number;
  monthly_usd: number;
  hourly_usd?: number;
  family?: string;
}

export interface PriceEstimate {
  monthly_usd: number;
  hourly_usd: number;
  breakdown: { label: string; monthly_usd: number }[];
  currency: "USD";
}

export interface ProvisionRequest {
  kind: ResourceKind;
  name: string;
  region: string;
  os?: OsFamily;
  image?: string;
  cpu_cores?: number;
  ram_mb?: number;
  disk_gb?: number;
  extra_disks_gb?: number[];
  template?: string; // one-click template id (wordpress, nginx, ...)
  template_params?: Record<string, unknown>;
  ssh_key?: string;
  password?: string;
  networks?: { name: string; ip?: string }[];
  daily_backup?: boolean;
  monitoring?: boolean;
  billing_cycle?: "hourly" | "monthly";
  tags?: string[];
  cost_cap_monthly_usd?: number;
  customer_id?: string | null;
  selling_price_usd?: number;
  notes?: string;
}

export interface ProvisionResult {
  provider_server_id: string;
  public_ips: string[];
  private_ips: string[];
  root_password_ref?: string;
  raw?: unknown;
}

export type PowerAction = "on" | "off" | "reboot";

export interface CloudProvider {
  name: ProviderName;
  displayName: string;
  supports: ResourceKind[];
  listRegions(): Promise<Region[]>;
  listImages(region: string): Promise<{ id: string; name: string; os?: OsFamily }[]>;
  listInstanceTypes(region: string): Promise<InstanceType[]>;
  estimatePrice(req: ProvisionRequest): Promise<PriceEstimate>;
  createServer(req: ProvisionRequest): Promise<ProvisionResult>;
  getServer(providerServerId: string): Promise<{ status: string; power_state: string; raw: unknown }>;
  powerAction(providerServerId: string, action: PowerAction): Promise<void>;
  terminate(providerServerId: string): Promise<void>;
}

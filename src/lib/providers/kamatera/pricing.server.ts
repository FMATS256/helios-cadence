// Deterministic Kamatera USD price estimator.
// Rates approximate published Kamatera list pricing; refine as needed.

const CPU_TYPE_RATE_PER_CORE: Record<string, number> = {
  B: 5, // Availability B
  A: 4, // Availability A
  T: 3, // Type T (burstable)
  D: 14, // Dedicated
};
const RAM_RATE_PER_GB = 2.5;
const DISK_RATE_PER_GB = 0.05; // SSD
const NETWORK_INCLUDED_GB = 5000;

export function estimateKamateraMonthlyUsd(input: {
  cpu_type?: string;
  cpu_cores: number;
  ram_mb: number;
  disks_gb: number[];
  daily_backup?: boolean;
  monitoring?: boolean;
}) {
  const cpuKey = (input.cpu_type ?? "B").toUpperCase();
  const cpuRate = CPU_TYPE_RATE_PER_CORE[cpuKey] ?? CPU_TYPE_RATE_PER_CORE.B;
  const cpu = cpuRate * Math.max(1, input.cpu_cores);
  const ram = (input.ram_mb / 1024) * RAM_RATE_PER_GB;
  const disk = input.disks_gb.reduce((s, g) => s + g * DISK_RATE_PER_GB, 0);
  const backup = input.daily_backup ? disk * 0.25 : 0;
  const monitoring = input.monitoring ? 1.5 : 0;
  const monthly_usd = round(cpu + ram + disk + backup + monitoring);
  return {
    monthly_usd,
    hourly_usd: round(monthly_usd / 730),
    currency: "USD" as const,
    breakdown: [
      { label: `CPU (${input.cpu_cores} × ${cpuKey})`, monthly_usd: round(cpu) },
      { label: `RAM (${(input.ram_mb / 1024).toFixed(1)} GB)`, monthly_usd: round(ram) },
      { label: `Disk (${input.disks_gb.reduce((s, g) => s + g, 0)} GB SSD)`, monthly_usd: round(disk) },
      ...(input.daily_backup ? [{ label: "Daily backup", monthly_usd: round(backup) }] : []),
      ...(input.monitoring ? [{ label: "Monitoring", monthly_usd: round(monitoring) }] : []),
      { label: `Network (${NETWORK_INCLUDED_GB} GB included)`, monthly_usd: 0 },
    ],
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

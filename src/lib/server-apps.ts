// One-click app installs. Each script is a bash cloud-init/startup script for
// Debian/Ubuntu servers. "Install on fresh server" wipes and reinstalls with the
// script (manager approval); staff can also copy the script and run it over SSH.
export type ServerApp = { key: string; label: string; description: string; os: string; script: string };

const head = "#!/bin/bash\nset -e\nexport DEBIAN_FRONTEND=noninteractive\napt-get update -y\n";

export const SERVER_APPS: ServerApp[] = [
  { key: "docker", label: "Docker", description: "Container engine for running apps", os: "Ubuntu/Debian",
    script: head + "curl -fsSL https://get.docker.com | sh\nsystemctl enable --now docker\n" },
  { key: "nextcloud", label: "Nextcloud", description: "File sharing and backup cloud", os: "Ubuntu",
    script: head + "apt-get install -y snapd\nsnap install nextcloud\n" },
  { key: "uptime-kuma", label: "Uptime Kuma", description: "Self-hosted uptime monitor on port 3001", os: "Ubuntu/Debian",
    script: head + "curl -fsSL https://get.docker.com | sh\ndocker run -d --restart=always -p 3001:3001 -v uptime-kuma:/app/data --name uptime-kuma louislam/uptime-kuma:1\n" },
  { key: "wireguard", label: "WireGuard VPN (wg-easy)", description: "VPN with web admin on port 51821", os: "Ubuntu/Debian",
    script: head + "curl -fsSL https://get.docker.com | sh\ndocker run -d --restart=always --name wg-easy -e WG_HOST=$(curl -s https://api.ipify.org) -v ~/.wg-easy:/etc/wireguard -p 51820:51820/udp -p 51821:51821/tcp --cap-add=NET_ADMIN --cap-add=SYS_MODULE --sysctl net.ipv4.ip_forward=1 ghcr.io/wg-easy/wg-easy:14\n" },
  { key: "freepbx", label: "FreePBX 17", description: "VoIP phone system (Debian 12 only)", os: "Debian 12",
    script: head + "wget -q https://github.com/FreePBX/sng_freepbx_debian_install/raw/master/sng_freepbx_debian_install.sh -O /tmp/freepbx.sh\nbash /tmp/freepbx.sh\n" },
  { key: "webmin", label: "Webmin", description: "Web control panel on port 10000", os: "Ubuntu/Debian",
    script: head + "curl -fsSL https://raw.githubusercontent.com/webmin/webmin/master/webmin-setup-repo.sh | sh -s -- -f\napt-get install -y webmin --install-recommends\n" },
];

export function serverApp(key: string) { return SERVER_APPS.find((a) => a.key === key); }

/** Actions that wipe or roll back a server need a manager's approval. */
export const APPROVAL_ACTIONS = ["rebuild", "restore_snapshot", "install_app"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];
export function needsApproval(action: string) { return (APPROVAL_ACTIONS as readonly string[]).includes(action); }

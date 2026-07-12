// Deployment templates. Each renders a cloud-init user-data (or shell) script.
// Phase 2: 10 real templates + stubs for the rest.

export type TemplateId =
  | "wordpress"
  | "nextcloud"
  | "docker"
  | "docker-compose"
  | "nginx"
  | "nodejs"
  | "postgres"
  | "mysql"
  | "mariadb"
  | "monitoring-stack"
  | "gitlab"
  | "jenkins"
  | "laravel"
  | "python"
  | "apache"
  | "freepbx"
  | "3cx"
  | "active-directory";

export interface TemplateDefinition {
  id: TemplateId;
  label: string;
  category: string;
  min_cpu: number;
  min_ram_mb: number;
  min_disk_gb: number;
  supported_os: ("ubuntu" | "debian" | "almalinux" | "rocky" | "windows")[];
  implemented: boolean;
  ports: number[];
  render: (params: Record<string, unknown>) => string;
  post_install_checks: { label: string; kind: "http" | "tcp"; port: number; path?: string }[];
}

const shebang = "#!/bin/bash\nset -euxo pipefail\nexport DEBIAN_FRONTEND=noninteractive\n";
const notImplemented = () => `${shebang}echo "Template not yet implemented" >&2; exit 1\n`;

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  wordpress: {
    id: "wordpress", label: "WordPress", category: "CMS",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [80, 443],
    post_install_checks: [{ label: "HTTP", kind: "http", port: 80, path: "/" }],
    render: (p) => {
      const dbPass = String(p.db_password ?? randomPass());
      return `${shebang}
apt-get update
apt-get install -y apache2 mariadb-server php php-mysql php-curl php-gd php-xml php-mbstring libapache2-mod-php wget unzip
systemctl enable --now apache2 mariadb
mysql -e "CREATE DATABASE IF NOT EXISTS wordpress; CREATE USER IF NOT EXISTS 'wp'@'localhost' IDENTIFIED BY '${dbPass}'; GRANT ALL ON wordpress.* TO 'wp'@'localhost'; FLUSH PRIVILEGES;"
cd /tmp && wget -q https://wordpress.org/latest.tar.gz && tar xzf latest.tar.gz
rm -rf /var/www/html/*
cp -r wordpress/* /var/www/html/
chown -R www-data:www-data /var/www/html
systemctl restart apache2
`;
    },
  },
  nextcloud: {
    id: "nextcloud", label: "Nextcloud", category: "Productivity",
    min_cpu: 2, min_ram_mb: 2048, min_disk_gb: 40,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [80, 443],
    post_install_checks: [{ label: "HTTP", kind: "http", port: 80, path: "/status.php" }],
    render: () => `${shebang}
apt-get update && apt-get install -y snapd
snap install nextcloud
`,
  },
  docker: {
    id: "docker", label: "Docker Engine", category: "Container",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian", "almalinux", "rocky"], implemented: true, ports: [],
    post_install_checks: [{ label: "TCP 22", kind: "tcp", port: 22 }],
    render: () => `${shebang}
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
`,
  },
  "docker-compose": {
    id: "docker-compose", label: "Docker Compose", category: "Container",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian", "almalinux", "rocky"], implemented: true, ports: [],
    post_install_checks: [{ label: "TCP 22", kind: "tcp", port: 22 }],
    render: () => `${shebang}
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
apt-get install -y docker-compose-plugin || dnf install -y docker-compose-plugin || true
`,
  },
  nginx: {
    id: "nginx", label: "NGINX", category: "Web server",
    min_cpu: 1, min_ram_mb: 512, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian", "almalinux", "rocky"], implemented: true, ports: [80, 443],
    post_install_checks: [{ label: "HTTP", kind: "http", port: 80, path: "/" }],
    render: () => `${shebang}
apt-get update && apt-get install -y nginx || dnf install -y nginx
systemctl enable --now nginx
`,
  },
  nodejs: {
    id: "nodejs", label: "Node.js", category: "Runtime",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [3000],
    post_install_checks: [{ label: "TCP 22", kind: "tcp", port: 22 }],
    render: (p) => `${shebang}
curl -fsSL https://deb.nodesource.com/setup_${p.node_major ?? 20}.x | bash -
apt-get install -y nodejs build-essential
`,
  },
  postgres: {
    id: "postgres", label: "PostgreSQL", category: "Database",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [5432],
    post_install_checks: [{ label: "TCP 5432", kind: "tcp", port: 5432 }],
    render: () => `${shebang}
apt-get update && apt-get install -y postgresql
systemctl enable --now postgresql
`,
  },
  mysql: {
    id: "mysql", label: "MySQL", category: "Database",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [3306],
    post_install_checks: [{ label: "TCP 3306", kind: "tcp", port: 3306 }],
    render: () => `${shebang}
apt-get update && apt-get install -y mysql-server
systemctl enable --now mysql
`,
  },
  mariadb: {
    id: "mariadb", label: "MariaDB", category: "Database",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian", "almalinux", "rocky"], implemented: true, ports: [3306],
    post_install_checks: [{ label: "TCP 3306", kind: "tcp", port: 3306 }],
    render: () => `${shebang}
apt-get update && apt-get install -y mariadb-server || dnf install -y mariadb-server
systemctl enable --now mariadb
`,
  },
  "monitoring-stack": {
    id: "monitoring-stack", label: "Prometheus + Grafana + Node Exporter", category: "Monitoring",
    min_cpu: 2, min_ram_mb: 2048, min_disk_gb: 30,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [3000, 9090, 9100],
    post_install_checks: [
      { label: "Grafana", kind: "http", port: 3000, path: "/api/health" },
      { label: "Prometheus", kind: "http", port: 9090, path: "/-/ready" },
    ],
    render: () => `${shebang}
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
mkdir -p /opt/monitoring && cd /opt/monitoring
cat > docker-compose.yml <<'YAML'
services:
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    restart: unless-stopped
  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    restart: unless-stopped
  node-exporter:
    image: prom/node-exporter:latest
    ports: ["9100:9100"]
    restart: unless-stopped
YAML
docker compose up -d
`,
  },
  gitlab: stub("gitlab", "GitLab", "DevOps", 4, 8192, 80, ["ubuntu"]),
  jenkins: stub("jenkins", "Jenkins", "DevOps", 2, 4096, 40, ["ubuntu", "debian"]),
  laravel: stub("laravel", "Laravel", "Framework", 1, 1024, 20, ["ubuntu", "debian"]),
  python: stub("python", "Python runtime", "Runtime", 1, 1024, 20, ["ubuntu", "debian"]),
  apache: stub("apache", "Apache HTTP Server", "Web server", 1, 512, 20, ["ubuntu", "debian", "almalinux", "rocky"]),
  freepbx: stub("freepbx", "FreePBX", "Telephony", 2, 2048, 40, ["almalinux", "rocky"]),
  "3cx": stub("3cx", "3CX", "Telephony", 2, 2048, 40, ["debian"]),
  "active-directory": stub("active-directory", "Active Directory", "Identity", 2, 4096, 60, ["windows"]),
};

function stub(
  id: TemplateId, label: string, category: string, cpu: number, ram: number, disk: number,
  os: TemplateDefinition["supported_os"],
): TemplateDefinition {
  return {
    id, label, category, min_cpu: cpu, min_ram_mb: ram, min_disk_gb: disk,
    supported_os: os, implemented: false, ports: [],
    post_install_checks: [{ label: "TCP 22", kind: "tcp", port: 22 }],
    render: notImplemented,
  };
}

function randomPass() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function listTemplateSummaries() {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id, label: t.label, category: t.category,
    min_cpu: t.min_cpu, min_ram_mb: t.min_ram_mb, min_disk_gb: t.min_disk_gb,
    supported_os: t.supported_os, implemented: t.implemented, ports: t.ports,
  }));
}

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
  gitlab: {
    id: "gitlab", label: "GitLab", category: "DevOps",
    min_cpu: 4, min_ram_mb: 8192, min_disk_gb: 80,
    supported_os: ["ubuntu"], implemented: true, ports: [80, 443, 22],
    post_install_checks: [{ label: "HTTP", kind: "http", port: 80, path: "/users/sign_in" }],
    render: () => `${shebang}
apt-get update && apt-get install -y curl ca-certificates tzdata openssh-server
curl -fsSL https://packages.gitlab.com/install/repositories/gitlab/gitlab-ce/script.deb.sh | bash
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
EXTERNAL_URL="http://$IP" apt-get install -y gitlab-ce
echo "Initial root password: /etc/gitlab/initial_root_password (deleted after 24h)"
`,
  },
  jenkins: {
    id: "jenkins", label: "Jenkins", category: "DevOps",
    min_cpu: 2, min_ram_mb: 4096, min_disk_gb: 40,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [8080],
    post_install_checks: [{ label: "HTTP 8080", kind: "http", port: 8080, path: "/login" }],
    render: () => `${shebang}
apt-get update && apt-get install -y fontconfig openjdk-17-jre curl gnupg
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key -o /usr/share/keyrings/jenkins-keyring.asc
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" > /etc/apt/sources.list.d/jenkins.list
apt-get update && apt-get install -y jenkins
systemctl enable --now jenkins
`,
  },
  laravel: {
    id: "laravel", label: "Laravel", category: "Framework",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [80, 443],
    post_install_checks: [{ label: "HTTP", kind: "http", port: 80, path: "/" }],
    render: (p) => {
      const dbPass = String(p.db_password ?? randomPass());
      return `${shebang}
apt-get update
apt-get install -y nginx mariadb-server php-fpm php-cli php-mysql php-mbstring php-xml php-curl php-zip php-bcmath unzip curl git
systemctl enable --now nginx mariadb
curl -fsSL https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
mysql -e "CREATE DATABASE IF NOT EXISTS laravel; CREATE USER IF NOT EXISTS 'laravel'@'localhost' IDENTIFIED BY '${dbPass}'; GRANT ALL ON laravel.* TO 'laravel'@'localhost'; FLUSH PRIVILEGES;"
cd /var/www && COMPOSER_ALLOW_SUPERUSER=1 composer create-project --no-interaction laravel/laravel app
cd app
sed -i "s/^DB_CONNECTION=.*/DB_CONNECTION=mysql/; s/^# *DB_HOST=.*/DB_HOST=127.0.0.1/; s/^# *DB_DATABASE=.*/DB_DATABASE=laravel/; s/^# *DB_USERNAME=.*/DB_USERNAME=laravel/; s/^# *DB_PASSWORD=.*/DB_PASSWORD=${dbPass}/" .env
php artisan migrate --force || true
chown -R www-data:www-data /var/www/app
PHPSOCK=$(ls /run/php/php*-fpm.sock | head -1)
cat > /etc/nginx/sites-available/default <<NGINX
server {
  listen 80 default_server;
  root /var/www/app/public;
  index index.php;
  location / { try_files \\$uri \\$uri/ /index.php?\\$query_string; }
  location ~ \\.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:$PHPSOCK; }
}
NGINX
systemctl reload nginx
`;
    },
  },
  python: {
    id: "python", label: "Python runtime", category: "Runtime",
    min_cpu: 1, min_ram_mb: 1024, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian"], implemented: true, ports: [],
    post_install_checks: [{ label: "TCP 22", kind: "tcp", port: 22 }],
    render: () => `${shebang}
apt-get update && apt-get install -y python3 python3-venv python3-pip python3-dev build-essential git
python3 -m venv /opt/app-venv
/opt/app-venv/bin/pip install --upgrade pip wheel gunicorn
`,
  },
  apache: {
    id: "apache", label: "Apache HTTP Server", category: "Web server",
    min_cpu: 1, min_ram_mb: 512, min_disk_gb: 20,
    supported_os: ["ubuntu", "debian", "almalinux", "rocky"], implemented: true, ports: [80, 443],
    post_install_checks: [{ label: "HTTP", kind: "http", port: 80, path: "/" }],
    render: () => `${shebang}
if command -v apt-get >/dev/null; then apt-get update && apt-get install -y apache2 && systemctl enable --now apache2
else dnf install -y httpd && systemctl enable --now httpd; fi
`,
  },
  freepbx: {
    id: "freepbx", label: "FreePBX 17", category: "Telephony",
    min_cpu: 2, min_ram_mb: 2048, min_disk_gb: 40,
    supported_os: ["debian"], implemented: true, ports: [80, 443, 5060],
    post_install_checks: [{ label: "HTTP", kind: "http", port: 80, path: "/admin" }],
    render: () => `${shebang}
# Official Sangoma installer for FreePBX 17 on Debian 12
cd /tmp
curl -fsSL https://github.com/FreePBX/sng_freepbx_debian_install/raw/master/sng_freepbx_debian_install.sh -o install.sh
bash install.sh
`,
  },
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

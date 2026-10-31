export type WorkloadGuide = { key: string; label: string; match: RegExp; os: string; ports: string; steps: string[]; rules: { protocol: "tcp" | "udp"; port: string; notes: string; restrict?: boolean }[] };

export const WORKLOAD_GUIDES: WorkloadGuide[] = [
  { key: "voip", rules: [{protocol:"udp",port:"5060:5061",notes:"SIP",restrict:true},{protocol:"tcp",port:"5060:5061",notes:"SIP TCP/TLS",restrict:true},{protocol:"udp",port:"9000:10999",notes:"RTP media"},{protocol:"tcp",port:"443",notes:"Web client"}], label: "3CX / FreePBX", match: /3cx|pbx|voip|sip|asterisk/i, os: "Debian 12", ports: "5060-5061 UDP/TCP, 9000-10999 UDP, 443",
    steps: ["Host in Johannesburg for low call delay", "Allow SIP only from the SIP trunk provider IPs", "Turn on fail2ban / 3CX anti-hacking", "Daily config backup off-server", "Set QoS on client routers for voice"] },
  { key: "pastel", rules: [{protocol:"tcp",port:"3389",notes:"Remote Desktop",restrict:true}], label: "Sage Pastel", match: /pastel/i, os: "Windows Server 2022", ports: "3389 (VPN only), 445 internal",
    steps: ["Remote Desktop only through VPN or allow-listed IPs", "Put data on a separate SSD disk", "Exclude Pastel data folder from antivirus scanning", "Nightly backup with 30-day retention", "One RDS licence per user"] },
  { key: "evol", rules: [{protocol:"tcp",port:"3389",notes:"Remote Desktop",restrict:true}], label: "Sage 200 Evolution", match: /evolution|sage ?200/i, os: "Windows Server 2022 + SQL Server", ports: "1433 internal, 3389 via VPN",
    steps: ["Give SQL Server at least half the RAM (set max memory)", "Data and logs on separate disks", "SQL full backup nightly, logs hourly", "Lock RDP to VPN"] },
  { key: "qbd", rules: [{protocol:"tcp",port:"3389",notes:"Remote Desktop",restrict:true}], label: "QuickBooks Desktop", match: /quickbooks|qbd/i, os: "Windows Server 2022", ports: "3389 via VPN, 8019/56728 internal",
    steps: ["Install QuickBooks Database Server Manager", "Host company file on local SSD", "Nightly backup and weekly verify", "Lock RDP to VPN"] },
  { key: "pall", rules: [{protocol:"tcp",port:"3389",notes:"Remote Desktop",restrict:true}], label: "Palladium", match: /palladium/i, os: "Windows Server 2022 + SQL Express/Std", ports: "1433 internal, 3389 via VPN",
    steps: ["Set SQL max memory", "Daily SQL backup off-server", "Lock RDP to VPN", "Install updates monthly in a maintenance window"] },
  { key: "web", rules: [{protocol:"tcp",port:"80",notes:"HTTP"},{protocol:"tcp",port:"443",notes:"HTTPS"},{protocol:"tcp",port:"2083",notes:"cPanel"},{protocol:"tcp",port:"2087",notes:"WHM",restrict:true},{protocol:"tcp",port:"25",notes:"SMTP"},{protocol:"tcp",port:"465",notes:"SMTPS"},{protocol:"tcp",port:"587",notes:"Submission"},{protocol:"tcp",port:"993",notes:"IMAPS"}], label: "cPanel / Web hosting", match: /cpanel|whm|web|wordpress/i, os: "AlmaLinux 9", ports: "80, 443, 2083, 2087, 25/465/587, 993",
    steps: ["Set a proper hostname with DNS", "Enable CSF firewall and Imunify/ModSecurity", "AutoSSL on for all sites", "Daily JetBackup / remote backups", "SPF, DKIM and DMARC for mail"] },
  { key: "nc", rules: [{protocol:"tcp",port:"443",notes:"HTTPS"}], label: "Nextcloud / Backups", match: /nextcloud|backup|storage|nas/i, os: "Ubuntu 24.04", ports: "443",
    steps: ["Put data on a large separate disk", "Use HTTPS only", "Enable server-side encryption and 2FA", "Keep one copy off-site"] },
  { key: "vms", rules: [{protocol:"tcp",port:"554",notes:"RTSP from site VPN",restrict:true}], label: "CCTV recording", match: /cctv|vms|nvr|camera/i, os: "Ubuntu 24.04 / Windows", ports: "554 RTSP from site VPN only",
    steps: ["Cameras connect over site VPN, not open internet", "Size disk for retention days × cameras", "Alert on recording stopped"] },
];

export function workloadGuide(text: string): WorkloadGuide | undefined {
  return WORKLOAD_GUIDES.find((g) => g.match.test(text));
}

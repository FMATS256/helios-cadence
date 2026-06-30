// Centralized mock data for the RoyEno Solartech CRM
export type LeadStage = "New" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";
export type ClientStatus = "Active" | "Installation" | "Proposal" | "Maintenance" | "Lead";

export const leads = [
  { id: "L-1042", name: "Tapiwa Moyo", company: "Moyo Residence", type: "Residential 5kW", amount: 4500, stage: "New" as LeadStage, source: "Website", owner: "Tawanda C.", phone: "+263 77 123 4567", city: "Harare", created: "2026-05-08" },
  { id: "L-1043", name: "Prosper Ndlovu", company: "Ndlovu Farm", type: "Solar Pump 3HP", amount: 3200, stage: "New" as LeadStage, source: "Referral", owner: "Rudo M.", phone: "+263 71 444 8821", city: "Bulawayo", created: "2026-05-09" },
  { id: "L-1044", name: "Alpha Engineering", company: "Alpha Eng. Ltd", type: "Commercial 30kW", amount: 32000, stage: "Qualified" as LeadStage, source: "WhatsApp", owner: "Tawanda C.", phone: "+263 78 991 0011", city: "Harare", created: "2026-05-04" },
  { id: "L-1045", name: "Greenview Cottage", company: "Greenview Hospitality", type: "Hybrid 8kW", amount: 6600, stage: "Qualified" as LeadStage, source: "Instagram", owner: "Rudo M.", phone: "+263 77 322 1190", city: "Nyanga", created: "2026-05-05" },
  { id: "L-1046", name: "ZimBrewery Ltd", company: "ZimBrewery Ltd", type: "Industrial 50kW", amount: 45000, stage: "Proposal" as LeadStage, source: "Trade Show", owner: "Brian K.", phone: "+263 78 555 9090", city: "Harare", created: "2026-04-29" },
  { id: "L-1047", name: "Sunridge Park", company: "Sunridge Estates", type: "Hybrid 8kW", amount: 4900, stage: "Proposal" as LeadStage, source: "Website", owner: "Tawanda C.", phone: "+263 77 712 4400", city: "Harare", created: "2026-04-30" },
  { id: "L-1048", name: "Mega Store Harare", company: "Mega Group", type: "Commercial 40kW", amount: 36000, stage: "Won" as LeadStage, source: "Referral", owner: "Brian K.", phone: "+263 78 100 2030", city: "Harare", created: "2026-04-15" },
  { id: "L-1049", name: "Mountain View Lodge", company: "MV Hospitality", type: "Hybrid 15kW", amount: 18600, stage: "Won" as LeadStage, source: "Direct", owner: "Rudo M.", phone: "+263 77 850 1212", city: "Mutare", created: "2026-04-18" },
  { id: "L-1050", name: "Borrowdale Clinic", company: "Borrowdale Health", type: "Backup 12kW", amount: 14800, stage: "Negotiation" as LeadStage, source: "Direct", owner: "Brian K.", phone: "+263 78 220 4411", city: "Harare", created: "2026-05-01" },
];

export const clients = [
  { id: "C-201", name: "Mega Store Harare", contact: "Farai Dube", phone: "+263 78 100 2030", email: "ops@megastore.co.zw", city: "Harare", address: "12 Robert Mugabe Rd, Harare", gps: "-17.8252, 31.0335", systemType: "Hybrid", systemSize: "40kW", inverter: "Victron Quattro 15kVA", battery: "Pylontech US5000 x6", status: "Installation" as ClientStatus, warranty: "10 yr panel / 5 yr inverter", nextAction: "Commissioning - 22 May", value: 36000 },
  { id: "C-202", name: "Mountain View Lodge", contact: "Tendai Marufu", phone: "+263 77 850 1212", email: "stay@mvlodge.co.zw", city: "Mutare", address: "Cecil Kop Rd, Mutare", gps: "-18.9707, 32.6709", systemType: "Hybrid", systemSize: "15kW", inverter: "Deye SUN-15K", battery: "Dyness 14.4kWh", status: "Active" as ClientStatus, warranty: "10 yr / 5 yr", nextAction: "Maintenance - 18 Jun", value: 18600 },
  { id: "C-203", name: "Alpha Engineering", contact: "Kuda Madziva", phone: "+263 78 991 0011", email: "kuda@alpha-eng.com", city: "Harare", address: "8 Steel Rd, Workington", gps: "-17.8456, 30.9912", systemType: "Commercial", systemSize: "30kW", inverter: "Sungrow SG30CX", battery: "—", status: "Proposal" as ClientStatus, warranty: "Pending", nextAction: "Follow Up - 23 May", value: 32000 },
  { id: "C-204", name: "Greenview Cottage", contact: "Anesu Chirinda", phone: "+263 77 322 1190", email: "stay@greenview.co.zw", city: "Nyanga", address: "Plot 14, World's View", gps: "-18.2167, 32.7333", systemType: "Hybrid", systemSize: "8kW", inverter: "Deye SUN-8K", battery: "Pylontech US3000 x3", status: "Proposal" as ClientStatus, warranty: "Pending", nextAction: "Follow Up - 21 May", value: 6600 },
  { id: "C-205", name: "Borrowdale Clinic", contact: "Dr. Sibanda", phone: "+263 78 220 4411", email: "admin@borrowdaleclinic.zw", city: "Harare", address: "Whitwell Rd, Borrowdale", gps: "-17.7402, 31.0993", systemType: "Backup", systemSize: "12kW", inverter: "Growatt SPF12000", battery: "BSLBatt 10kWh", status: "Maintenance" as ClientStatus, warranty: "8 yr / 5 yr", nextAction: "Service - 30 May", value: 14800 },
  { id: "C-206", name: "Sunridge Park HOA", contact: "Memory Tafara", phone: "+263 77 712 4400", email: "hoa@sunridge.co.zw", city: "Harare", address: "Sunridge Estate Gate", gps: "-17.7901, 31.0021", systemType: "Hybrid", systemSize: "8kW", inverter: "Deye SUN-8K", battery: "Pylontech US3000 x2", status: "Proposal" as ClientStatus, warranty: "Pending", nextAction: "Site Visit - 24 May", value: 4900 },
];

export const products = [
  { id: "P-PNL-450", name: "JA Solar 450W Mono", category: "Panel", brand: "JA Solar", price: 0.21, unit: "$/W", stock: 1840, warranty: "12 yr product / 25 yr power" },
  { id: "P-PNL-550", name: "Canadian Solar 550W", category: "Panel", brand: "Canadian Solar", price: 0.22, unit: "$/W", stock: 920, warranty: "12 yr / 25 yr" },
  { id: "P-INV-8K", name: "Deye SUN-8K Hybrid", category: "Inverter", brand: "Deye", price: 1450, unit: "ea", stock: 24, warranty: "5 yr" },
  { id: "P-INV-15K", name: "Deye SUN-15K Hybrid", category: "Inverter", brand: "Deye", price: 2680, unit: "ea", stock: 12, warranty: "5 yr" },
  { id: "P-INV-30K", name: "Sungrow SG30CX", category: "Inverter", brand: "Sungrow", price: 3950, unit: "ea", stock: 6, warranty: "5 yr" },
  { id: "P-BAT-US5K", name: "Pylontech US5000", category: "Battery", brand: "Pylontech", price: 1320, unit: "ea", stock: 38, warranty: "10 yr" },
  { id: "P-BAT-DY14", name: "Dyness 14.4 kWh Tower", category: "Battery", brand: "Dyness", price: 4180, unit: "ea", stock: 9, warranty: "10 yr" },
  { id: "P-KIT-RES5", name: "RoyEno Residential 5kW Kit", category: "Kit", brand: "RoyEno", price: 4500, unit: "ea", stock: 14, warranty: "Bundled" },
  { id: "P-KIT-COM30", name: "RoyEno Commercial 30kW Kit", category: "Kit", brand: "RoyEno", price: 32000, unit: "ea", stock: 3, warranty: "Bundled" },
];

export const installations = [
  { id: "INST-501", client: "Mega Store Harare", system: "40kW Hybrid", status: "Commissioning", scheduled: "2026-05-22", lead: "Brian K.", techs: ["Farai", "Tonderai"], progress: 85, city: "Harare" },
  { id: "INST-502", client: "Mountain View Lodge", system: "15kW Hybrid", status: "Active", scheduled: "2026-04-28", lead: "Tawanda C.", techs: ["Munashe"], progress: 100, city: "Mutare" },
  { id: "INST-503", client: "Sunridge Park HOA", system: "8kW Hybrid", status: "Site Visit", scheduled: "2026-05-24", lead: "Tawanda C.", techs: ["Tonderai"], progress: 10, city: "Harare" },
  { id: "INST-504", client: "Borrowdale Clinic", system: "12kW Backup", status: "Maintenance", scheduled: "2026-05-30", lead: "Rudo M.", techs: ["Farai"], progress: 100, city: "Harare" },
  { id: "INST-505", client: "Alpha Engineering", system: "30kW Commercial", status: "Scheduled", scheduled: "2026-06-04", lead: "Brian K.", techs: ["Farai", "Munashe"], progress: 30, city: "Harare" },
];

export const quotes = [
  { id: "QT-2025-088", client: "Greenview Cottage", system: "8kW Hybrid", amount: 6600, status: "Sent", date: "2026-05-06", validUntil: "2026-06-06" },
  { id: "QT-2025-089", client: "Alpha Engineering", system: "30kW Commercial", amount: 32000, status: "Viewed", date: "2026-05-04", validUntil: "2026-06-04" },
  { id: "QT-2025-090", client: "Sunridge Park HOA", system: "8kW Hybrid", amount: 4900, status: "Draft", date: "2026-05-09", validUntil: "2026-06-09" },
  { id: "QT-2025-091", client: "Borrowdale Clinic", system: "12kW Backup", amount: 14800, status: "Accepted", date: "2026-04-30", validUntil: "2026-05-30" },
  { id: "QT-2025-092", client: "ZimBrewery Ltd", system: "50kW Industrial", amount: 45000, status: "Sent", date: "2026-05-02", validUntil: "2026-06-02" },
];

export const proposals = [
  { id: "PR-104", client: "ZimBrewery Ltd", title: "50kW Grid-Tied Industrial Solution", amount: 45000, status: "Sent", owner: "Brian K.", date: "2026-05-03" },
  { id: "PR-105", client: "Alpha Engineering", title: "30kW Rooftop Commercial", amount: 32000, status: "In Review", owner: "Tawanda C.", date: "2026-05-05" },
  { id: "PR-106", client: "Sunridge Park HOA", title: "8kW Estate Backup Bundle", amount: 4900, status: "Draft", owner: "Tawanda C.", date: "2026-05-10" },
  { id: "PR-107", client: "Borrowdale Clinic", title: "12kW Critical-Load Backup", amount: 14800, status: "Accepted", owner: "Rudo M.", date: "2026-04-29" },
];

export const invoices = [
  { id: "INV-3301", client: "Mega Store Harare", amount: 18000, status: "Paid", due: "2026-04-30", issued: "2026-04-15" },
  { id: "INV-3302", client: "Mega Store Harare", amount: 18000, status: "Pending", due: "2026-05-25", issued: "2026-05-05" },
  { id: "INV-3303", client: "Mountain View Lodge", amount: 18600, status: "Paid", due: "2026-04-28", issued: "2026-04-12" },
  { id: "INV-3304", client: "Borrowdale Clinic", amount: 14800, status: "Paid", due: "2026-05-10", issued: "2026-04-25" },
  { id: "INV-3305", client: "Alpha Engineering", amount: 16000, status: "Overdue", due: "2026-05-08", issued: "2026-04-20" },
  { id: "INV-3306", client: "Greenview Cottage", amount: 3300, status: "Pending", due: "2026-05-30", issued: "2026-05-09" },
];

export const payments = [
  { id: "PMT-9001", invoice: "INV-3301", client: "Mega Store Harare", amount: 18000, method: "EFT", date: "2026-04-29", status: "Cleared" },
  { id: "PMT-9002", invoice: "INV-3303", client: "Mountain View Lodge", amount: 18600, method: "EFT", date: "2026-04-26", status: "Cleared" },
  { id: "PMT-9003", invoice: "INV-3304", client: "Borrowdale Clinic", amount: 14800, method: "Card", date: "2026-05-09", status: "Cleared" },
  { id: "PMT-9004", invoice: "INV-3306", client: "Greenview Cottage", amount: 1650, method: "Mobile", date: "2026-05-10", status: "Pending" },
];

export const tasks = [
  { id: "T-1", title: "Follow up with Tapiwa Moyo", due: "Today 14:00", owner: "Tawanda C.", priority: "High", done: false, related: "L-1042" },
  { id: "T-2", title: "Site visit — Alpha Engineering", due: "Tomorrow 09:00", owner: "Brian K.", priority: "High", done: false, related: "C-203" },
  { id: "T-3", title: "Prepare proposal — Greenview Cottage", due: "Wed 17:00", owner: "Tawanda C.", priority: "Medium", done: false, related: "C-204" },
  { id: "T-4", title: "Monthly sales report", due: "Fri 12:00", owner: "Tawanda C.", priority: "Medium", done: false, related: null },
  { id: "T-5", title: "Order Pylontech batteries", due: "Mon 10:00", owner: "Rudo M.", priority: "High", done: false, related: null },
  { id: "T-6", title: "Confirm commissioning crew — Mega Store", due: "Today 16:30", owner: "Brian K.", priority: "High", done: true, related: "INST-501" },
];

export const documents = [
  { id: "D-1", name: "Mega Store — Signed Contract.pdf", client: "Mega Store Harare", type: "Contract", size: "2.1 MB", uploaded: "2026-04-15" },
  { id: "D-2", name: "Deye SUN-15K Datasheet.pdf", client: "—", type: "Datasheet", size: "0.9 MB", uploaded: "2026-03-02" },
  { id: "D-3", name: "Borrowdale Warranty Certificate.pdf", client: "Borrowdale Clinic", type: "Warranty", size: "0.4 MB", uploaded: "2026-05-09" },
  { id: "D-4", name: "Alpha Eng — Site Survey Photos.zip", client: "Alpha Engineering", type: "Survey", size: "18.4 MB", uploaded: "2026-05-04" },
  { id: "D-5", name: "RoyEno Standard Terms 2026.pdf", client: "—", type: "Template", size: "0.6 MB", uploaded: "2026-01-12" },
];

export const contacts = [
  { id: "CN-1", name: "Farai Dube", role: "Operations Mgr", company: "Mega Store Harare", phone: "+263 78 100 2030", email: "farai@megastore.co.zw" },
  { id: "CN-2", name: "Tendai Marufu", role: "Owner", company: "Mountain View Lodge", phone: "+263 77 850 1212", email: "tendai@mvlodge.co.zw" },
  { id: "CN-3", name: "Kuda Madziva", role: "Facilities Lead", company: "Alpha Engineering", phone: "+263 78 991 0011", email: "kuda@alpha-eng.com" },
  { id: "CN-4", name: "Anesu Chirinda", role: "Property Mgr", company: "Greenview Cottage", phone: "+263 77 322 1190", email: "anesu@greenview.co.zw" },
  { id: "CN-5", name: "Dr. Sibanda", role: "Clinic Director", company: "Borrowdale Clinic", phone: "+263 78 220 4411", email: "sibanda@borrowdaleclinic.zw" },
  { id: "CN-6", name: "Memory Tafara", role: "HOA Chair", company: "Sunridge Park HOA", phone: "+263 77 712 4400", email: "memory@sunridge.co.zw" },
];

export const notifications = [
  { id: "N-1", title: "New lead assigned", body: "Tapiwa Moyo (Residential 5kW) was assigned to you.", time: "5 min ago", type: "lead", unread: true },
  { id: "N-2", title: "Quote viewed", body: "Alpha Engineering opened QT-2025-089.", time: "32 min ago", type: "quote", unread: true },
  { id: "N-3", title: "Payment received", body: "$14,800 from Borrowdale Clinic (INV-3304).", time: "2 hr ago", type: "payment", unread: true },
  { id: "N-4", title: "Installation milestone", body: "Mega Store Harare reached 85% — commissioning Friday.", time: "Yesterday", type: "install", unread: false },
  { id: "N-5", title: "Invoice overdue", body: "Alpha Engineering INV-3305 is 3 days overdue.", time: "Yesterday", type: "invoice", unread: false },
];

export const revenueSeries = [
  { month: "Nov", revenue: 92000, deals: 6 },
  { month: "Dec", revenue: 118000, deals: 8 },
  { month: "Jan", revenue: 104000, deals: 7 },
  { month: "Feb", revenue: 142000, deals: 9 },
  { month: "Mar", revenue: 158000, deals: 11 },
  { month: "Apr", revenue: 174000, deals: 12 },
  { month: "May", revenue: 186450, deals: 13 },
];

export const pipelineSeries = [
  { stage: "New", value: 7700 },
  { stage: "Qualified", value: 38600 },
  { stage: "Proposal", value: 49900 },
  { stage: "Negotiation", value: 14800 },
  { stage: "Won", value: 54600 },
];

export const sourceSeries = [
  { name: "Website", value: 34 },
  { name: "WhatsApp", value: 22 },
  { name: "Referral", value: 18 },
  { name: "Trade Show", value: 9 },
  { name: "Instagram", value: 12 },
  { name: "Direct", value: 5 },
];

export const campaigns = [
  { id: "CMP-1", name: "Summer Solar 2026", channel: "Email + WhatsApp", status: "Running", leads: 142, conversions: 18, spend: 2400 },
  { id: "CMP-2", name: "Commercial Rooftop", channel: "LinkedIn", status: "Running", leads: 56, conversions: 7, spend: 1800 },
  { id: "CMP-3", name: "Load-Shedding Backup", channel: "Radio + SMS", status: "Paused", leads: 211, conversions: 24, spend: 3200 },
  { id: "CMP-4", name: "Lodge & Hospitality", channel: "Email", status: "Draft", leads: 0, conversions: 0, spend: 0 },
];

export const calendarEvents = [
  { id: "E-1", title: "Site visit — Alpha Engineering", date: "2026-05-12", time: "09:00", type: "Visit" },
  { id: "E-2", title: "Commissioning — Mega Store", date: "2026-05-22", time: "08:00", type: "Install" },
  { id: "E-3", title: "Follow up — Sunridge HOA", date: "2026-05-24", time: "11:00", type: "Call" },
  { id: "E-4", title: "Maintenance — Borrowdale Clinic", date: "2026-05-30", time: "10:00", type: "Service" },
  { id: "E-5", title: "Internal — Sales sync", date: "2026-05-13", time: "16:00", type: "Internal" },
];

export const technicians = [
  { id: "TC-1", name: "Farai Mhute", phone: "+263 77 220 1144", region: "Harare", jobs: 28, rating: 4.9, available: true },
  { id: "TC-2", name: "Tonderai Chuma", phone: "+263 78 808 9090", region: "Harare", jobs: 22, rating: 4.7, available: true },
  { id: "TC-3", name: "Munashe Sibanda", phone: "+263 71 414 7878", region: "Manicaland", jobs: 17, rating: 4.8, available: false },
  { id: "TC-4", name: "Privilege Kanu", phone: "+263 77 555 0011", region: "Bulawayo", jobs: 14, rating: 4.6, available: true },
];

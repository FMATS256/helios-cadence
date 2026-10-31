ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS workload text,
  ADD COLUMN IF NOT EXISTS provider_plan text;

INSERT INTO public.service_catalog (code, name, category, description, unit_price, cost_price, currency, billing_cycle, is_active, tier, workload, provider_plan)
SELECT v.* FROM (VALUES
 ('VOIP-SRV-ENTRY','VoIP PBX Server — Entry','voip','1 vCPU / 2 GB / 55 GB · up to 8 calls, 10 extensions',29::numeric,10::numeric,'USD','monthly',true,'entry','voip','vc2-1c-2gb'),
 ('VOIP-SRV-SILVER','VoIP PBX Server — Silver','voip','2 vCPU / 4 GB / 80 GB · up to 16 calls, 30 extensions',49,20,'USD','monthly',true,'silver','voip','vc2-2c-4gb'),
 ('VOIP-SRV-GOLD','VoIP PBX Server — Gold','voip','4 vCPU / 8 GB / 160 GB · up to 32 calls, recording',89,40,'USD','monthly',true,'gold','voip','vc2-4c-8gb'),
 ('VOIP-SRV-PLATINUM','VoIP PBX Server — Platinum','voip','4 vCPU NVMe / 16 GB / 384 GB · call centre, 64+ calls',185,96,'USD','monthly',true,'platinum','voip','vhf-4c-16gb'),
 ('ACCT-SRV-ENTRY','Accounting Server — Entry','cloud','2 vCPU / 4 GB / 80 GB · 1–2 users Pastel/QuickBooks',45,20,'USD','monthly',true,'entry','accounting','vc2-2c-4gb'),
 ('ACCT-SRV-SILVER','Accounting Server — Silver','cloud','4 vCPU / 8 GB / 160 GB · 3–8 users + backups',85,40,'USD','monthly',true,'silver','accounting','vc2-4c-8gb'),
 ('ACCT-SRV-GOLD','Accounting Server — Gold','cloud','6 vCPU / 16 GB / 320 GB · Sage Evolution, multi-branch',155,80,'USD','monthly',true,'gold','accounting','vc2-6c-16gb'),
 ('ACCT-SRV-PLATINUM','Accounting Server — Platinum','cloud','8 vCPU / 32 GB / 640 GB · enterprise ERP with RDS',295,160,'USD','monthly',true,'platinum','accounting','vc2-8c-32gb'),
 ('WEB-SRV-ENTRY','Hosting Server — Entry','hosting','1 vCPU / 2 GB / 55 GB · 5–10 websites',25,10,'USD','monthly',true,'entry','web','vc2-1c-2gb'),
 ('WEB-SRV-SILVER','Hosting Server — Silver','hosting','2 vCPU / 4 GB / 80 GB · 20–40 websites',45,20,'USD','monthly',true,'silver','web','vc2-2c-4gb'),
 ('WEB-SRV-GOLD','Hosting Server — Gold','hosting','4 vCPU / 8 GB / 160 GB · 50+ websites',79,40,'USD','monthly',true,'gold','web','vc2-4c-8gb'),
 ('WEB-SRV-PLATINUM','Hosting Server — Platinum','hosting','6 vCPU / 16 GB / 320 GB · high-traffic portals',149,80,'USD','monthly',true,'platinum','web','vc2-6c-16gb')
) AS v(code,name,category,description,unit_price,cost_price,currency,billing_cycle,is_active,tier,workload,provider_plan)
WHERE NOT EXISTS (SELECT 1 FROM public.service_catalog s WHERE s.code = v.code);
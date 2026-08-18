insert into public.service_catalog (code,name,category,description,unit_price,currency,billing_cycle,is_active) values
('VOIP-STARTER','VoIP Starter Line','voip','Single DID number with 2 extensions',12.00,'USD','monthly',true),
('VOIP-BUSINESS','VoIP Business','voip','DID number with 10 extensions and call recording',35.00,'USD','monthly',true),
('VOIP-ENTERPRISE','VoIP Enterprise PBX','voip','Hosted PBX, unlimited extensions, IVR',89.00,'USD','monthly',true),
('VOIP-DID','Additional DID Number','voip','Extra direct inward dial number',5.00,'USD','monthly',true),
('VOIP-EXT','Additional Extension','voip','Extra SIP extension',2.50,'USD','monthly',true),
('CLOUD-DESKTOP','Managed Cloud Desktop','cloud','Hosted Windows desktop per user',35.00,'USD','monthly',true),
('CLOUD-BACKUP-SRV','Managed Cloud Backup — Server','cloud','Offsite server backup with retention',30.00,'USD','monthly',true),
('CLOUD-MGD-K8S','Managed Kubernetes Cluster','cloud','Managed container platform',150.00,'USD','monthly',true)
on conflict (code) do nothing;
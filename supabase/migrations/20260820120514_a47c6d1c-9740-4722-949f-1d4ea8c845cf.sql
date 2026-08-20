
insert into public.quotes (id, customer_id, account_number, quote_number, title, amount, currency, status, valid_until, notes)
values
 ('a1000000-0000-4000-8000-000000000001','1c446fd5-dd72-46c3-b2a2-7b82f869d34b','M0007','QT-2026-0001','Managed Cloud VPS Package',1440,'USD','draft', current_date + 30, 'Managed cloud hosting proposal for IMT Solutions.'),
 ('a1000000-0000-4000-8000-000000000002','1c446fd5-dd72-46c3-b2a2-7b82f869d34b','M0007','QT-2026-0002','Starlink Business Connectivity',2150,'USD','draft', current_date + 30, 'Starlink hardware and monthly service proposal.'),
 ('a1000000-0000-4000-8000-000000000003','1c446fd5-dd72-46c3-b2a2-7b82f869d34b','M0007','QT-2026-0003','VoIP PBX Rollout - 25 Extensions',1875,'USD','draft', current_date + 30, 'Cloud PBX deployment with 25 extensions.'),
 ('a1000000-0000-4000-8000-000000000004','1c446fd5-dd72-46c3-b2a2-7b82f869d34b','M0007','QT-2026-0004','Microsoft 365 Licences & Managed NAS',3260,'USD','draft', current_date + 30, 'Licensing and on-prem managed NAS backup solution.')
on conflict (id) do nothing;

insert into public.quote_line_items (quote_id, description, quantity, unit_price, tax_rate, position) values
 ('a1000000-0000-4000-8000-000000000001','Cloud VPS - 8 vCPU / 16GB RAM / 400GB SSD (monthly)',12,95,0,1),
 ('a1000000-0000-4000-8000-000000000001','Setup, migration and hardening (once-off)',1,300,0,2),
 ('a1000000-0000-4000-8000-000000000002','Starlink Business kit (hardware)',1,850,0,1),
 ('a1000000-0000-4000-8000-000000000002','Starlink Business service - 100GB priority (monthly)',10,120,0,2),
 ('a1000000-0000-4000-8000-000000000002','Installation and mounting',1,100,0,3),
 ('a1000000-0000-4000-8000-000000000003','Cloud PBX extension licence (monthly)',25,45,0,1),
 ('a1000000-0000-4000-8000-000000000003','IP desk phone - Yealink T31P',25,25,0,2),
 ('a1000000-0000-4000-8000-000000000003','PBX configuration and number porting',1,125,0,3),
 ('a1000000-0000-4000-8000-000000000004','Microsoft 365 Business Standard (annual, per seat)',40,66,0,1),
 ('a1000000-0000-4000-8000-000000000004','Managed NAS 12TB with offsite replication',1,520,0,2),
 ('a1000000-0000-4000-8000-000000000004','Backup policy setup and staff training',1,100,0,3);

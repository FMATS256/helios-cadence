delete from public.web_hosting_accounts where domain = 'test-addsvc.co.zw';
delete from public.customer_services cs using public.subscriptions s where cs.subscription_id = s.id and s.plan_name = 'Website Starter Hosting' and s.created_at > now() - interval '30 minutes';
delete from public.subscriptions where plan_name = 'Website Starter Hosting' and created_at > now() - interval '30 minutes';
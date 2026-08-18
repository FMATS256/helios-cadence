delete from public.workspace_servers ws where ws.server_id in (select id from public.cloud_servers where status = 'failed');
delete from public.cloud_activity a where a.server_id in (select id from public.cloud_servers where status = 'failed');
delete from public.server_backups b where b.server_id in (select id from public.cloud_servers where status = 'failed');
delete from public.cloud_servers where status = 'failed';
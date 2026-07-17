-- STAP 3 — dicht anonieme upload + listing op de public bucket 'guide-help'.
-- Oud: guide_help_service_insert (INSERT voor PUBLIC) = iedereen mag uploaden;
--      guide_help_public_read (SELECT voor PUBLIC) = iedereen mag listen (lint 0025).
-- Nieuw: alle mutaties alleen voor superadmins; publieke object-URL's blijven werken (public bucket).

drop policy if exists "guide_help_service_insert" on storage.objects;
drop policy if exists "guide_help_public_read"     on storage.objects;

create policy "guide_help_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'guide-help' and public.is_superadmin());

create policy "guide_help_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'guide-help' and public.is_superadmin());

create policy "guide_help_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'guide-help' and public.is_superadmin())
  with check (bucket_id = 'guide-help' and public.is_superadmin());

create policy "guide_help_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'guide-help' and public.is_superadmin());

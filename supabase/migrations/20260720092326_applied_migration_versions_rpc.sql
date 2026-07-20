-- applied_migration_versions — voedt de migratie-drift-panel op /beheer/versie.
--
-- Geeft de toegepaste migratie-versies (de `version`-kolom van
-- supabase_migrations.schema_migrations) terug, zodat het versie-dashboard kan
-- laten zien welke migratie-BESTANDEN nog niet zijn toegepast (de drift die
-- dingen breekt) en welke toegepaste versies geen bestand meer hebben.
--
-- SECURITY DEFINER + vaste search_path: het supabase_migrations-schema is niet
-- leesbaar voor de app-rollen, dus lezen we het als owner. Zoals de
-- admin_lookup_*-RPC's (20260711170000) wordt EXECUTE uitsluitend aan
-- service_role gegeven: de enige aanroeper is app/api/admin/version-status, die
-- al achter isSuperAdmin draait en via de service-role-client (ADR 0006) roept.
-- De service-role-client heeft geen auth.uid(), dus een interne per-user-guard
-- zou niets teruggeven — de superadmin-check zit bewust in de route. Geen
-- anon/authenticated-exposure.

create or replace function public.applied_migration_versions()
returns setof text
language sql
security definer
set search_path = ''
as $$
  select version
  from supabase_migrations.schema_migrations
  order by version;
$$;

revoke execute on function public.applied_migration_versions() from public, anon, authenticated;
grant execute on function public.applied_migration_versions() to service_role;

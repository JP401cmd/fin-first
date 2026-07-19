-- Performance-sanering fase 1 — nalevering op Migratie 2
--
-- WAAROM: de SELECT-policy "Members can view household invitations" evalueert auth.email() per rij
-- (auth_rls_initplan). Werd in Migratie 2 gemist omdat de ontdek-query alleen op auth.uid/jwt/role
-- filterde, niet op auth.email(). Zelfde gedragsneutrale rewrite: auth.email() -> (select auth.email()).

alter policy "Members can view household invitations" on public.household_invitations
  using ((household_id = user_household_id()) or (lower(invited_email) = lower(coalesce((select auth.email()), ''::text))));

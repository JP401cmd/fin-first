-- ============================================================================
-- beta_set_addon — de beta-keuze voor een add-on als één atomaire stap (ADR 0157)
-- ============================================================================
--
-- Waarom
-- ------
-- `POST /api/beta/addon` deed met de service-role een lezen-aanpassen-schrijven
-- op `profiles.active_subscriptions` (+ `commercial_tier`) en schreef daarna los
-- een regel in `tier_assignments_log`. Dat is niet atomair: een gelijktijdige
-- tweede tab of beheertoekenning kon een wijziging stil overschrijven
-- (security-review 17 sep, ADR 0157 "Gevolgen" punt 5). Deze functie doet het
-- in één transactie, met een rijlock op het profiel.
--
-- Gedrag (spiegelt de route en lib/beta-addons.ts exact)
-- ------------------------------------------------------
--   * p_tier moet 'ai' of 'connected' zijn, anders 22023.
--   * nieuwe array = array_remove(oud, tier), en bij aan daarna array_append —
--     dus nooit een dubbele, andere entries blijven staan en in volgorde
--     (= `nextSubscriptions`).
--   * `commercial_tier`: ai > connected > gratis (= `commercialTierFor`).
--   * "gewijzigd" = (tier zat erin) ≠ p_active (= de route). Alleen dan update +
--     logregel. Label: 'gratis' bij een lege array, anders de entries met '+';
--     new_tier krijgt het achtervoegsel ' (beta-keuze)'. assigned_by = p_user_id.
--   * Terug: jsonb { subscriptions: text[], changed: boolean }. Bij geen wijziging
--     is `subscriptions` de genormaliseerde array (zoals de route teruggaf).
--   * Geen profielrij (of p_user_id NULL) → exception P0002. Bewuste keuze boven
--     NULL: de route kende "profiel ontbreekt" al als fout (500), en een exception
--     kan niet per ongeluk als "ok, niets veranderd" gelezen worden.
--
-- Bewuste afwijking van de route: de logregel is nu atomair met de wijziging.
-- Faalt de insert, dan rolt de add-on-wijziging mee terug (fail-closed). Het
-- logboek is de enige manier om beta-keuzes later terug te vinden
-- (`new_tier like '%(beta-keuze)'`), dus een wijziging zonder regel is erger dan
-- een keuze die opnieuw gedaan moet worden.
--
-- Toegangsmodel
-- -------------
--   * SECURITY DEFINER, eigenaar postgres, `search_path = ''`, volledig
--     gekwalificeerde namen.
--   * EXECUTE ingetrokken van public, anon en authenticated; alleen service_role.
--     Daarbovenop de rolcheck in de body (patroon admin_activity_counts,
--     20260915121000): een JWT-rol die geen service_role is → 42501; zonder
--     JWT-context (directe verbinding als postgres) door.
--   * p_user_id komt NIET van de client: de route geeft `claims.sub` mee. Een
--     authenticated gebruiker kan de functie niet aanroepen (grant), dus kan geen
--     andere rij raken.
--   * Trigger `guard_profiles_role` (BEFORE UPDATE op profiles) laat alles door
--     wanneer `current_user` niet 'authenticated'/'anon' is. Binnen een SECURITY
--     DEFINER-functie is current_user de eigenaar (postgres), dus de trigger
--     blokkeert deze functie niet — en blijft een directe update door
--     authenticated weigeren. Gemeten tegen pg_get_functiondef + pg_proc.proowner
--     op de live database, 17-09-2026.
--   * Geen nieuwe tabel/kolom: RLS ongewijzigd. tier_assignments_log blijft
--     deny-all voor interactieve rollen; deze functie schrijft als eigenaar.
--
-- Live gemeten (17-09-2026, pg_attribute / pg_constraint / pg_proc)
-- -----------------------------------------------------------------
--   profiles.active_subscriptions  text[]  nullable, default ARRAY[]::text[]
--   profiles.commercial_tier       text    not null, default 'gratis',
--                                  CHECK in ('gratis','connected','ai')
--   tier_assignments_log: target_user uuid not null (FK profiles ON DELETE CASCADE),
--     assigned_by uuid not null (FK profiles), old_tier text null,
--     new_tier text not null, id/created_at met default.
--   Security-definer-functies in public: eigenaar postgres, ACL
--     {postgres=X/postgres,service_role=X/postgres} — het patroon hieronder.
--
-- Bekende rest
-- ------------
-- Beta-aanroepen serialiseren nu op de rijlock. `app/api/admin/tier-assign` doet
-- zelf nog een lezen-schrijven in JS en kan deze wijziging dus nog overschrijven
-- (niet andersom). Die route hoort op termijn dezelfde weg te gaan.
--
-- Terugweg: een correctiemigratie met
--   drop function if exists public.beta_set_addon(uuid, text, boolean);
-- en de route terug naar de vorige writeSubscriptions (git). Er wordt geen data
-- gemigreerd, dus er valt niets terug te zetten.
-- ============================================================================

create or replace function public.beta_set_addon(
  p_user_id uuid,
  p_tier    text,
  p_active  boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol     text := auth.role();
  v_old     text[];
  v_new     text[];
  v_changed boolean;
  v_found   boolean;
begin
  if v_rol is not null and v_rol <> 'service_role' then
    raise exception 'beta_set_addon: alleen voor service_role'
      using errcode = '42501';
  end if;

  if p_tier is null or p_tier not in ('ai', 'connected') then
    raise exception 'beta_set_addon: onbekende add-on'
      using errcode = '22023';
  end if;

  if p_active is null then
    raise exception 'beta_set_addon: p_active ontbreekt'
      using errcode = '22023';
  end if;

  select coalesce(p.active_subscriptions, array[]::text[]), true
    into v_old, v_found
    from public.profiles p
   where p.id = p_user_id
     for update;

  if v_found is not true then
    raise exception 'beta_set_addon: profiel ontbreekt'
      using errcode = 'P0002';
  end if;

  v_new := pg_catalog.array_remove(v_old, p_tier);
  if p_active then
    v_new := pg_catalog.array_append(v_new, p_tier);
  end if;

  v_changed := (p_tier = any (v_old)) is distinct from p_active;

  if v_changed then
    update public.profiles p
       set active_subscriptions = v_new,
           commercial_tier = case
             when 'ai' = any (v_new) then 'ai'
             when 'connected' = any (v_new) then 'connected'
             else 'gratis'
           end
     where p.id = p_user_id;

    insert into public.tier_assignments_log (target_user, assigned_by, old_tier, new_tier)
    values (
      p_user_id,
      p_user_id,
      case when pg_catalog.cardinality(v_old) = 0 then 'gratis'
           else pg_catalog.array_to_string(v_old, '+') end,
      (case when pg_catalog.cardinality(v_new) = 0 then 'gratis'
            else pg_catalog.array_to_string(v_new, '+') end) || ' (beta-keuze)'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'subscriptions', pg_catalog.to_jsonb(v_new),
    'changed', v_changed
  );
end;
$$;

comment on function public.beta_set_addon(uuid, text, boolean) is
  'Beta-keuze voor een add-on (ai|connected): atomair active_subscriptions + commercial_tier '
  'aanpassen en bij wijziging een tier_assignments_log-regel. Alleen service_role (ADR 0157).';

revoke all on function public.beta_set_addon(uuid, text, boolean) from public;
revoke all on function public.beta_set_addon(uuid, text, boolean) from anon;
revoke all on function public.beta_set_addon(uuid, text, boolean) from authenticated;
grant execute on function public.beta_set_addon(uuid, text, boolean) to service_role;

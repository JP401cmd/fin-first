-- Gebruikersgroepen — herbruikbare doelgroepen voor vragenlijsten. ADR 0147 fase 3,
-- op de grens van ADR 0146 "Beheer ziet gebruik, geen inhoud".
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- Een vragenlijst met doelgroep-modus `groepen` (questionnaires.verspreiding)
-- verwijst naar groep-id's. Twee soorten groep (lib/gebruikersgroepen.ts):
--   * statisch  — een ledenlijst die beheer samenstelt (interviewwerving, een
--                 beta-cohort). Leden in `user_group_members`.
--   * dynamisch — een regelset (AND) op gebruiksmeta, telkens opnieuw geëvalueerd
--                 bij het lezen. Geen ledenlijst, dus nooit verouderd.
-- Matchen gebeurt COMPUTE-ON-READ in GET /api/questionnaires met de SESSIE-client
-- van de gebruiker: "ben ik lid van een van deze statische groepen" (eigen rijen
-- in user_group_members) OF "voldoe ik aan de regels van een van deze dynamische
-- groepen" (id/soort/regels uit user_groups). Er worden geen uitnodigingen
-- gematerialiseerd: een lid toevoegen of verwijderen werkt meteen door in elke
-- lijst die de groep gebruikt.
--
-- Daarnaast één RPC, `admin_emails_for_user_ids`, zodat beheer bij groepsleden een
-- e-mailadres kan tonen zonder dat er ergens een kopie van dat adres wordt
-- opgeslagen.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- user_groups — GEEN persoonsgegevens, wél interne labels (naam, omschrijving) die
-- beheer schrijft en die een gebruiker niet hoort te zien ("Twijfelaars
-- pensioen", "Afhakers na onboarding").
--   SELECT  — `to authenticated using (soort = 'dynamisch')`. Een gebruiker heeft
--             alleen dynamische groepen nodig, om hun regels tegen zijn eigen
--             meta te houden. Statische groepen herkent hij via zijn eigen
--             lidmaatschap-rij; de groepsrij zelf blijft onzichtbaar.
--   KOLOMRECHT op SELECT — tabelbreed SELECT ingetrokken, alleen
--             `(id, soort, regels)` teruggegeven. Naam en omschrijving zijn voor
--             authenticated daardoor onleesbaar, óók van dynamische groepen. RLS
--             kan dit niet: een policy filtert rijen, geen kolommen.
--             GEVOLG (bedoeld): `select('*')` door authenticated geeft 42501, want
--             `*` vraagt ook naam/omschrijving/created_at/updated_at. De afnemer
--             (app/api/questionnaires/route.ts#laadGroepMeta) vraagt expliciet
--             `id, soort, regels`.
--             LET OP bij een toekomstige kolom die de gebruiker wél moet lezen:
--             die heeft een eigen `grant select (kolom)` nodig.
--   Wat een gebruiker WEL kan zien: de id's en regels van alle dynamische groepen.
--             Regels zijn voorwaarden op gebruiksmeta (dagen sinds registratie,
--             actieve dagen, dominante waardestroom) zonder id's of inhoud — dat
--             is aanvaard. Vertrouwelijke intentie hoort in de naam/omschrijving,
--             en die zijn afgeschermd.
--   INSERT / UPDATE / DELETE — geen policies én geen grants voor authenticated.
--
-- user_group_members — PERSOONSGEGEVEN (wie zit in welke groep).
--   SELECT  — eigen rij (`user_id = auth.uid()`): transparantie (het is zijn
--             gegeven, ook in de zelfexport) én nodig voor GET /api/questionnaires.
--             Een gebruiker ziet nooit wie er nog meer in zijn groep zit.
--   INSERT / UPDATE / DELETE — geen policies én geen grants voor authenticated.
--             Een lidmaatschap is een toewijzing door beheer: kon de gebruiker
--             zichzelf toevoegen, dan wees hij zichzelf vragenlijsten toe; kon
--             hij zichzelf verwijderen, dan wiste hij een keuze van beheer.
--
-- Beide tabellen: GEEN superadmin-tak. Gemeten vóór spiegelen — de oudere
-- vragenlijsttabellen dragen die nog van vóór ADR 0146 en worden hier bewust niet
-- gekopieerd. Beheer leest en schrijft uitsluitend via de service-role, ná
-- isSuperAdmin in de route (ADR 0006/0146). anon: tabelgrants ingetrokken.
--
-- ── Schrijfpad ────────────────────────────────────────────────────────────────
--   POST/PUT/DELETE /api/admin/user-groups[/id]      SERVICE-ROLE — groepen
--         (zod: GroepInvoerSchema).
--   PUT  /api/admin/user-groups/[id]/leden           SERVICE-ROLE — volledige
--         ledenlijst vervangen (zod: GroepLedenSchema, max 2000).
--   lib/seed-persona.ts#deleteAllUserData            SERVICE-ROLE — wist de eigen
--         lidmaatschap-rijen bij reset en verwijdering.
-- Gebruikers schrijven geen van beide tabellen.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- user_groups: geen persoonsgegeven, niet in de AVG-indeling.
-- user_group_members: in lib/user-data-tables.ts als SERVICE_WIPE_TABLES — bewust
-- niet SESSION_WIPE, want er is geen eigen-rij DELETE-policy — en in de zelfexport
-- via de eigen-rij SELECT. FK op auth.users met ON DELETE CASCADE: bij
-- accountverwijdering blijft er niets achter.
-- admin_emails_for_user_ids: leest het e-mailadres ter weergave aan beheer, slaat
-- niets op en is alleen door de service-role aan te roepen.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Nieuwe tabellen + nieuwe functies, niets bestaands geraakt: mag vóór de code.
-- De code leest tolerant: een ontbrekende tabel geeft "geen lid, geen dynamische
-- groepen" en een groep-lijst blijft dan onzichtbaar (fail-closed).
-- Hangt niet af van 20260915121000 of 20260915140000.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie met
--   drop function if exists public.admin_emails_for_user_ids(uuid[]);
--   drop table if exists public.user_group_members;
--   drop table if exists public.user_groups;           -- neemt trigger mee
--   drop function if exists public.user_groups_set_updated_at();
-- — pas nadat de beheerroutes, de beheer-UI, het groepenpad in GET
-- /api/questionnaires en de regels in lib/user-data-tables.ts /
-- lib/seed-persona.ts zijn verwijderd. Een vragenlijst die (nog) naar een
-- verwijderde groep verwijst, matcht daarna niemand meer (fail-closed): groep-id's
-- in questionnaires.verspreiding en questionnaire_invitations.bron_detail zijn
-- bewust geen FK, dus er cascadeert niets en er verschijnt niets bij iedereen.
-- Hetzelfde geldt voor het verwijderen van één groep in normaal gebruik.
--
-- ── LEAK-CHECK ────────────────────────────────────────────────────────────────
-- BEWUSTE AFWIJKING van het huiscontract "anon: 0 rijen én géén fout", identiek
-- aan 20260915121000/131000: anon heeft géén tabelgrant, dus 42501 is het
-- verwachte resultaat. Verwachtingen:
--   * anon select op user_groups of user_group_members           → 42501
--   * authenticated select('*') op user_groups                    → 42501 (kolomrecht)
--   * authenticated select('naam') op user_groups                 → 42501 (kolomrecht)
--   * authenticated select('id, soort, regels') op user_groups    → alleen dynamische
--     groepen; een statische groep is onzichtbaar (0 rijen, geen fout), óók voor
--     een lid van die groep
--   * authenticated A leest user_group_members                    → alleen eigen rijen;
--     rijen van B = 0 rijen, geen fout
--   * authenticated insert/update/delete op één van beide         → 42501 (geen grant)
--   * authenticated rpc admin_emails_for_user_ids(...)            → 42501 (geen EXECUTE)
--   * service_role rpc admin_emails_for_user_ids met 2001 id's    → 22023
--
-- ── Live gemeten vóór schrijven (15-09-2026, read-only via execute_sql) ───────
--   * `list_migrations`: laatst toegepast = 20260915131000; 20260915121000 en
--     20260915122000 NIET toegepast.
--   * `to_regclass`: public.user_groups en public.user_group_members = NULL.
--   * `pg_proc`: public.admin_emails_for_user_ids bestaat niet;
--     public.admin_activity_counts bestaat NIET live (121000 niet toegepast) — de
--     rolcheck + grants hieronder volgen het repobestand 20260915121000.
--     public.admin_lookup_user_by_email bestaat live met prosecdef = true,
--     proconfig = {search_path=""} en ACL {postgres=X, service_role=X}: het
--     patroon "alleen veilige kolommen uit auth.users, alleen service_role" draait
--     dus echt zo.
--   * `information_schema.columns` auth.users: id uuid NOT NULL, email
--     character varying NULLABLE → cast naar text, en een id zonder e-mail geeft
--     een rij met email NULL.
--   * Updated_at-triggerfuncties (pg_proc, prorettype = trigger, bron bevat
--     updated_at, schema public/extensions): alleen
--     public.update_questionnaires_updated_at, met search_path=public (niet leeg)
--     en EXECUTE voor PUBLIC/anon/authenticated; extensie moddatetime is niet
--     geïnstalleerd. Niet hergebruikt: een eigen functie met `search_path = ''`
--     hieronder.
--   * `pg_default_acl` (postgres, public): tabellen `arwdDxtm` en functies `X` voor
--     anon én authenticated; `server_version` = 17.6, dus MAINTAIN (`m`) bestaat
--     en wordt óók ingetrokken.

-- ── user_groups ───────────────────────────────────────────────────────────────
create table if not exists public.user_groups (
  id           uuid        primary key default gen_random_uuid(),
  -- Interne labels van beheer. Voor authenticated onleesbaar (kolomrecht).
  naam         text        not null,
  omschrijving text,
  soort        text        not null,
  -- Alleen voor dynamische groepen: een array van regels (RegelSchema,
  -- lib/questionnaires/verspreiding.ts). Ongeldige inhoud matcht nooit
  -- (parseGroepRegels → []).
  regels       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint user_groups_naam_check
    check (char_length(btrim(naam)) between 1 and 100),
  constraint user_groups_omschrijving_check
    check (omschrijving is null or char_length(omschrijving) <= 500),
  constraint user_groups_soort_check
    check (soort in ('statisch', 'dynamisch')),
  constraint user_groups_regels_array_check
    check (regels is null or jsonb_typeof(regels) = 'array'),
  -- CASE i.p.v. `regels is not null and jsonb_array_length(regels) > 0`: SQL
  -- garandeert geen evaluatievolgorde, en jsonb_array_length op een object gooit
  -- 22023 in plaats van de nette 23514 van een geschonden CHECK.
  constraint user_groups_dynamisch_heeft_regels_check
    check (
      soort <> 'dynamisch'
      or case when jsonb_typeof(regels) = 'array' then jsonb_array_length(regels) > 0 else false end
    )
);

comment on table public.user_groups is
  'Gebruikersgroepen voor vragenlijstverspreiding (ADR 0147 fase 3): statisch (leden in '
  'user_group_members) of dynamisch (regels, compute-on-read). Authenticated leest alleen '
  'dynamische groepen en alleen de kolommen id/soort/regels (kolomrecht). Beheer schrijft '
  'via de service-role (ADR 0006/0146).';

comment on column public.user_groups.naam is
  'Intern label van beheer. Niet leesbaar voor authenticated (kolomrecht).';

comment on column public.user_groups.omschrijving is
  'Interne toelichting van beheer. Niet leesbaar voor authenticated (kolomrecht).';

-- updated_at bij elke wijziging. Eigen functie i.p.v. hergebruik van
-- update_questionnaires_updated_at (search_path=public, EXECUTE voor iedereen —
-- zie "Live gemeten"). Een triggerfunctie heeft geen EXECUTE-grant nodig bij het
-- vuren (alleen bij CREATE TRIGGER), dus alle EXECUTE-rechten gaan eraf.
create or replace function public.user_groups_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.user_groups_set_updated_at() from public;
revoke all on function public.user_groups_set_updated_at() from anon;
revoke all on function public.user_groups_set_updated_at() from authenticated;

drop trigger if exists user_groups_set_updated_at on public.user_groups;
create trigger user_groups_set_updated_at
  before update on public.user_groups
  for each row execute function public.user_groups_set_updated_at();

alter table public.user_groups enable row level security;

-- Least privilege op grant-niveau.
revoke all on table public.user_groups from anon;
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.user_groups from authenticated;

-- Kolomrecht: tabelbreed SELECT eraf, alleen wat de gebruikersroute nodig heeft
-- terug. Naam en omschrijving blijven onleesbaar; select('*') → 42501 (bedoeld).
revoke select on table public.user_groups from authenticated;
grant select (id, soort, regels) on table public.user_groups to authenticated;

drop policy if exists "user_groups dynamisch select" on public.user_groups;
create policy "user_groups dynamisch select" on public.user_groups
  for select to authenticated
  using (soort = 'dynamisch');

-- ── user_group_members ────────────────────────────────────────────────────────
create table if not exists public.user_group_members (
  group_id uuid        not null references public.user_groups(id) on delete cascade,
  user_id  uuid        not null references auth.users(id)         on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.user_group_members is
  'Leden van statische gebruikersgroepen (ADR 0147 fase 3). Persoonsgegeven. Eigen-rij '
  'SELECT voor authenticated; schrijven uitsluitend via de service-role (beheer).';

-- De PK (group_id, user_id) dekt "leden van groep X" (beheer); de lees-hotpath
-- van de gebruiker is andersom: "mijn groepen" in GET /api/questionnaires.
create index if not exists user_group_members_user_id_idx
  on public.user_group_members (user_id);

alter table public.user_group_members enable row level security;

revoke all on table public.user_group_members from anon;
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.user_group_members from authenticated;

drop policy if exists "user_group_members own select" on public.user_group_members;
create policy "user_group_members own select" on public.user_group_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── admin_emails_for_user_ids(uuid[]) ─────────────────────────────────────────
-- Id → e-mailadres voor een lijst gebruikers-id's, zodat beheer bij groepsleden
-- een adres toont zonder een kopie op te slaan. Id's zonder account komen niet
-- terug; een account zonder e-mail geeft email NULL.
--
-- Leest uit auth.users uitsluitend `id` en `email`, zoals
-- admin_lookup_user_by_email (20260711170000): een plain SELECT op die kolommen
-- raakt de token-kolommen niet en is daardoor ook immuun voor de NULL-token-
-- corruptie die GoTrue's listUsers liet falen.
--
-- Begrensd op 2000 id's (= GROEP_LEDEN_MAX): meer → 22023, zodat de functie geen
-- adresboek-dump in één aanroep wordt.
--
-- SECURITY DEFINER met `search_path = ''`; rolcheck en grants als
-- admin_activity_counts() in 20260915121000: alleen service_role; een JWT-rol
-- anders dan service_role → 42501; zonder JWT-context (directe verbinding) door.
create or replace function public.admin_emails_for_user_ids(p_ids uuid[])
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol text := auth.role();
begin
  if v_rol is not null and v_rol <> 'service_role' then
    raise exception 'admin_emails_for_user_ids: alleen voor service_role'
      using errcode = '42501';
  end if;

  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return;
  end if;

  if pg_catalog.cardinality(p_ids) > 2000 then
    raise exception 'admin_emails_for_user_ids: maximaal 2000 id''s per aanroep'
      using errcode = '22023';
  end if;

  return query
  select u.id, u.email::text
  from auth.users u
  where u.id = any (p_ids);
end;
$$;

comment on function public.admin_emails_for_user_ids(uuid[]) is
  'Id → e-mail uit auth.users (alleen die twee kolommen) voor maximaal 2000 id''s, ter '
  'weergave bij groepsleden in beheer. Slaat niets op. Alleen service_role (ADR 0006/0146/0147).';

revoke all on function public.admin_emails_for_user_ids(uuid[]) from public;
revoke all on function public.admin_emails_for_user_ids(uuid[]) from anon;
revoke all on function public.admin_emails_for_user_ids(uuid[]) from authenticated;
grant execute on function public.admin_emails_for_user_ids(uuid[]) to service_role;

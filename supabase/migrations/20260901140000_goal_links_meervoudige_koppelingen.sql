-- Doelen koppelen aan MEERDERE bezittingen en/of schulden — `public.goal_links`.
--
-- WAAROM: vandaag draagt `goals` twee enkelvoudige kolommen (`linked_asset_id`,
-- `linked_debt_id`). Eén doel kan dus aan precies één bezitting én één schuld
-- hangen. Voor "samen sparen voor het huis" (drie spaarpotten) of "schuldenvrij"
-- (twee leningen) is dat te smal. Deze migratie voegt een koppeltabel toe; de
-- legacy-kolommen BLIJVEN staan en worden NIET gedropt — er zijn nog lezers in
-- lib/ en app/ die erop leunen, en een kolom droppen is onomkeerbaar. De backfill
-- hieronder maakt `goal_links` de rijkere bron; het uitfaseren van de twee
-- kolommen is een aparte, latere migratie zodra de laatste lezer weg is.
--
-- ── GEMETEN FEITEN (live database, pg_constraint / pg_policies / pg_proc / data,
--    01-09-2026 — NIET uit migratiebestanden overgenomen, conform ADR 0045) ─────
--   * goals.user_id            → auth.users(id)   ON DELETE CASCADE
--     goals.linked_asset_id    → assets(id)       ON DELETE SET NULL
--     goals.linked_debt_id     → debts(id)        ON DELETE SET NULL
--     goals.household_id       → households(id)   ON DELETE SET NULL
--     assets.user_id / debts.user_id: uuid NOT NULL, beide → auth.users(id)
--   * SELECT-policy "View own or shared goals" op goals staat op {authenticated}:
--       ((select auth.uid()) = user_id)
--       or (ownership = 'shared' and household_id is not null
--           and household_id = (select user_household_id()))
--     De INSERT/UPDATE/DELETE-policies op goals/assets/debts staan op eigen rij
--     ((select auth.uid()) = user_id) met rolset {public}.
--   * user_household_id(): STABLE SECURITY DEFINER, returns uuid, en `anon` heeft
--     GEEN execute (proacl: postgres/authenticated/service_role). Vandaar dat de
--     SELECT-policy hieronder strikt `to authenticated` is: een rolset met anon
--     zou anon een harde fout geven i.p.v. 0 rijen — precies wat de gate
--     public.rls_helper_policy_hygiene() (migratie 20260810220000) als
--     `anon_zonder_execute` afkeurt. Om dezelfde reden staat de helper hier
--     gewikkeld als (select public.user_household_id()) — kaal evalueert hij per
--     rij (ADR 0048 + addendum).
--   * Pre-flight op de data: 25 doelen, 3 met een gekoppelde bezitting, 0 met een
--     gekoppelde schuld, 0 met beide, 0 wijzend naar een bezitting/schuld van een
--     ándere gebruiker, 0 verweesde verwijzingen, 0 doelen met ownership='shared'.
--     De backfill zet dus 3 rijen om en de guard-trigger raakt geen bestaande rij.
--   * public.goal_links bestond nog niet.
--
-- ── AFWIJKING VAN DE OPDRACHT: user_id → auth.users, niet profiles ─────────────
-- De opdracht vroeg `user_id references profiles(id)`. Gemeten tegen
-- pg_constraint (01-09-2026) verwijst de hele doelen-familie naar auth.users:
-- goals, goal_contributions, assets en debts alle vier → auth.users(id). 39
-- publieke tabellen doen dat, 12 verwijzen naar profiles. Omdat profiles.id zélf
-- → auth.users(id) ON DELETE CASCADE draagt, is het opruimgedrag bij een
-- accountverwijdering identiek; het verschil is dat een profiles-FK bovendien
-- eist dát er een profielrij bestaat. Consistentie met de drie DIRECTE ouders van
-- deze tabel weegt hier zwaarder, dus: auth.users. Bewuste keuze, geen omissie.

-- ══ 1. Tabel ═════════════════════════════════════════════════════════════════
--
-- Eén rij = één koppeling. De CHECK dwingt XOR af: precies één van asset_id /
-- debt_id is gevuld. Dat maakt van deze tabel bewust géén generieke
-- polymorfe-FK-constructie: beide kolommen dragen een echte foreign key, zodat de
-- datalaag verweesde verwijzingen zelf onmogelijk maakt.
--
-- ON DELETE CASCADE op alle drie de FK's (anders dan de SET NULL op de
-- legacy-kolommen van `goals`): een koppelrij zónder doel, bezitting óf schuld is
-- betekenisloos en zou de XOR-CHECK breken. Verdwijnt de bezitting, dan hoort de
-- koppeling mee te verdwijnen — niet als half-lege rij achter te blijven.
create table if not exists public.goal_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  goal_id     uuid not null references public.goals(id) on delete cascade,
  asset_id    uuid references public.assets(id) on delete cascade,
  debt_id     uuid references public.debts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint goal_links_precies_een_doelwit
    check ((asset_id is null) <> (debt_id is null))
);

comment on table public.goal_links is
  'Koppelt één doel aan meerdere bezittingen en/of schulden (many-to-many). Vervangt op termijn goals.linked_asset_id/linked_debt_id; die kolommen blijven voorlopig staan omdat er nog lezers zijn. Precies één van asset_id/debt_id is gevuld (CHECK goal_links_precies_een_doelwit). EIGENAARSCHAP: doel, bezitting én schuld moeten van goal_links.user_id zijn — afgedwongen door trigger trg_guard_goal_link_owner, want een FK-check draait als tabel-eigenaar en omzeilt RLS.';

comment on column public.goal_links.user_id is
  'Eigenaar van de koppeling. Verwijst naar auth.users(id), consistent met goals/assets/debts/goal_contributions. Alle schrijfpolicies zijn eigen-rij op deze kolom; de guard-trigger vergelijkt de eigenaar van doel/bezitting/schuld hiermee.';

-- ══ 2. Indexen ═══════════════════════════════════════════════════════════════
--
-- Partial uniques i.p.v. één UNIQUE(goal_id, asset_id, debt_id): in een gewone
-- unique index is NULL nooit gelijk aan NULL, dus (doel X, bezitting A, null)
-- zou onbeperkt herhaald mogen worden. Met de WHERE-clausule bevat elke index
-- alleen rijen waar de betreffende kolom gevuld is en is de uniciteit dus wél
-- NULL-veilig.
create unique index if not exists goal_links_goal_asset_uniek
  on public.goal_links (goal_id, asset_id) where asset_id is not null;
create unique index if not exists goal_links_goal_debt_uniek
  on public.goal_links (goal_id, debt_id) where debt_id is not null;

-- FK-indexen, vorm en naamgeving conform 20260719085405_perf_fk_indexes.sql
-- (idx_<tabel>_<kolom>). Ook goal_id krijgt er een eigen: de partial uniques
-- hierboven beginnen weliswaar met goal_id, maar zijn partieel en dekken dus niet
-- elke rij — de cascade-check bij het verwijderen van een doel heeft een volledige
-- index nodig.
create index if not exists idx_goal_links_goal_id on public.goal_links (goal_id);
create index if not exists idx_goal_links_asset_id on public.goal_links (asset_id);
create index if not exists idx_goal_links_debt_id on public.goal_links (debt_id);
create index if not exists idx_goal_links_user_id on public.goal_links (user_id);

-- ══ 3. RLS ═══════════════════════════════════════════════════════════════════
alter table public.goal_links enable row level security;

-- LEZEN is bewust breder dan schrijven: eigen rij, óf elke koppeling die onder een
-- huishoud-gedeeld doel hangt. Zonder die tweede tak zou een partner een gedeeld
-- doel wél zien maar zonder de bezittingen/schulden die het doel dragen. De
-- expressie spiegelt exact "View own or shared goals" op public.goals (hierboven
-- gemeten), zodat er precies één definitie van "gedeeld doel" in de database staat.
--
-- Rolset strikt `to authenticated` — zie de anon/user_household_id()-noot in de kop.
drop policy if exists "goal_links own or shared select" on public.goal_links;
create policy "goal_links own or shared select" on public.goal_links
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or exists (
      select 1
      from public.goals g
      where g.id = goal_links.goal_id
        and g.ownership = 'shared'::text
        and g.household_id is not null
        and g.household_id = (select public.user_household_id())
    )
  );

-- SCHRIJVEN is uitsluitend eigen rij — géén huishoud-tak. Ook op een gedeeld doel
-- schrijft alleen de eigenaar van het doel; de partner leest mee via de policy
-- hierboven. Dat is de striktere kant van een ambigu patroon en is later te
-- verruimen; andersom (verruimen nu, terugdraaien later) zou al geschreven rijen
-- achterlaten die niemand meer mag beheren.
--
-- EÉN UITZONDERING, en die is niet met een policy te dichten: verwijdert de
-- partner een GEDEELD doel (dat mag hij — zie de delete-tak in /api/goals), dan
-- ruimt `goal_id ... on delete cascade` ook de koppelrijen van de eigenaar op.
-- Een cascade draait als tabel-eigenaar en passeert RLS. Dat is gewenst gedrag
-- (koppelingen zonder doel zijn wezen), maar de invariant hierboven geldt dus
-- voor RECHTSTREEKSE schrijfacties, niet voor opruiming via de ouder.
--
-- UPDATE draagt expliciet zowel `using` als `with check`. Vertrouw hier niet op de
-- impliciete-USING-regel van Postgres: zonder eigen `with check` kan een rij naar
-- een andere user_id worden geschreven zodra iemand de USING-tak passeert — precies
-- de valkuil die 20260730210321 in zijn nagekomen aantekening benoemt.
drop policy if exists "goal_links own insert" on public.goal_links;
create policy "goal_links own insert" on public.goal_links
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "goal_links own update" on public.goal_links;
create policy "goal_links own update" on public.goal_links
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "goal_links own delete" on public.goal_links;
create policy "goal_links own delete" on public.goal_links
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ══ 4. Eigenaarsguard ════════════════════════════════════════════════════════
--
-- WAAROM DEZE TRIGGER ONMISBAAR IS (zelfde patroon en zelfde motivatie als
-- 20260730210321_guard_bank_accounts_linked_asset_owner.sql): RLS scope't de RÍJ,
-- niet de WAARDE van een FK-kolom daarop. De policies hierboven toetsen alleen
-- `user_id`. Een ingelogde gebruiker kan dus een rij met zijn EIGEN user_id
-- schrijven waarin goal_id/asset_id/debt_id naar een object van een ander wijst;
-- de FK-check die dat zou moeten opmerken draait als tabel-eigenaar en omzeilt RLS
-- volledig. En de id's zijn niet louter theoretisch te raden: de SELECT-policies op
-- goals/assets/debts zijn huishoud-verbreed, dus een partner LEEST legitiem de id's
-- van gedeelde objecten van de ander.
--
-- De invariant die niet van de aanroeproute mag afhangen:
--   eigenaar(goal_id) = user_id  EN  eigenaar(asset_id | debt_id) = user_id
--
-- SCOPE-KEUZE — strikt EIGEN GEBRUIKER, niet huishouden. Het precedent is op dit
-- punt niet ambigu: guard_bank_account_linked_asset() vergelijkt met
-- `new.user_id` en weigert expliciet ook de huishoud-gedeelde bezitting van de
-- partner. Diezelfde strikte lijn geldt hier voor alle drie de verwijzingen,
-- inclusief goal_id: samenwerken aan een gedeeld doel gebeurt door mee te LEZEN
-- (de SELECT-policy), niet door in elkaars doel te schrijven. Verruimen kan later
-- alsnog met één nieuwe migratie.
create or replace function public.guard_goal_link_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eigenaar uuid;
begin
  -- Alleen valideren bij een echte waardewijziging. Zo kan een latere UPDATE op
  -- een rij die de koppeling al draagt nooit alsnog stuklopen — bijvoorbeeld als
  -- een bezitting later door huishoud-reparenting van eigenaar wisselt. Zelfde
  -- overweging als in guard_bank_account_linked_asset().
  if tg_op = 'UPDATE'
     and new.goal_id  is not distinct from old.goal_id
     and new.asset_id is not distinct from old.asset_id
     and new.debt_id  is not distinct from old.debt_id
     and new.user_id  is not distinct from old.user_id then
    return new;
  end if;

  -- Het ouder-doel.
  select g.user_id into v_eigenaar
  from public.goals g
  where g.id = new.goal_id;

  -- Eén antwoord voor "bestaat niet" en "niet van jou": geen existentie-orakel op
  -- andermans id's, en geen id's of andermans gegevens in de melding.
  if v_eigenaar is null or v_eigenaar is distinct from new.user_id then
    raise exception 'Dit doel bestaat niet of is niet van jou'
      using errcode = '42501';
  end if;

  -- De gekoppelde bezitting. De XOR-CHECK garandeert dat precies één van beide
  -- takken hieronder daadwerkelijk toetst.
  if new.asset_id is not null then
    select a.user_id into v_eigenaar
    from public.assets a
    where a.id = new.asset_id;

    if v_eigenaar is null or v_eigenaar is distinct from new.user_id then
      raise exception 'Deze bezitting bestaat niet of is niet van jou'
        using errcode = '42501';
    end if;
  end if;

  -- De gekoppelde schuld.
  if new.debt_id is not null then
    select d.user_id into v_eigenaar
    from public.debts d
    where d.id = new.debt_id;

    if v_eigenaar is null or v_eigenaar is distinct from new.user_id then
      raise exception 'Deze schuld bestaat niet of is niet van jou'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Hygiëne (precedent: 20260729222421 / 20260730210321): een trigger draait
-- ongeacht EXECUTE-grants, dus niemand hoeft deze functie zelf te kunnen
-- aanroepen. `public` staat er expliciet bij — functies krijgen bij creatie
-- EXECUTE aan PUBLIC en rolspecifiek revoken is daar een no-op.
revoke all on function public.guard_goal_link_owner() from public, anon, authenticated;

drop trigger if exists trg_guard_goal_link_owner on public.goal_links;
create trigger trg_guard_goal_link_owner
  before insert or update on public.goal_links
  for each row execute function public.guard_goal_link_owner();

-- ══ 5. Backfill ══════════════════════════════════════════════════════════════
--
-- De bestaande enkelvoudige koppelingen overzetten. `user_id` komt uit
-- goals.user_id, zodat de guard-trigger per definitie klopt — en de backfill is
-- daarmee meteen het bewijs dat de guard geen enkele bestaande rij afkeurt
-- (pre-flight: 3 rijen, 0 met een afwijkende eigenaar, 0 verweesd).
--
-- `on conflict do nothing` zonder conflict-doel: dat dekt béíde partial uniques
-- in één keer, dus deze migratie kan zonder gevolg twee keer draaien.
-- De legacy-kolommen worden NIET geleegd en NIET gedropt.
insert into public.goal_links (user_id, goal_id, asset_id)
select g.user_id, g.id, g.linked_asset_id
from public.goals g
where g.linked_asset_id is not null
on conflict do nothing;

insert into public.goal_links (user_id, goal_id, debt_id)
select g.user_id, g.id, g.linked_debt_id
from public.goals g
where g.linked_debt_id is not null
on conflict do nothing;

-- ══ 6. Datanormalisatie op goals.goal_type ═══════════════════════════════════
--
-- WAAROM: `goals.goal_type` is text NOT NULL zónder CHECK-constraint of enum
-- (gemeten tegen pg_attribute/pg_constraint, 01-09-2026), dus de datalaag heeft
-- nooit tegengehouden wat de UI erin schreef. De quick-add-sheet schreef
-- 'wealth' en 'debt' — waarden waar GOAL_TYPE_META in de frontend géén entry voor
-- heeft, waardoor zulke doelen zonder label/icoon renderen. De canonieke waarden
-- zijn 'net_worth' en 'debt_payoff'; beide bestaan al in de data.
--
-- Idempotent van nature: na de eerste run matcht de WHERE niets meer.
-- Pre-flight (01-09-2026): de huidige verdeling is savings 10, savings_rate 3,
-- salary 3, fire_age 3, net_worth 3, debt_payoff 2, expected_return 1 — nul rijen
-- met 'wealth' of 'debt'. Deze twee UPDATE's raken vandaag dus 0 rijen; ze staan
-- er als vangnet voor rijen die tussen deze meting en de uitrol nog binnenkomen,
-- en als vindplaats van de bedoelde mapping.
--
-- Bewust GEEN CHECK-constraint toegevoegd: de toegestane verzameling leeft nu in
-- de frontend (GOAL_TYPE_META) en zou hier stilletjes uit de pas gaan lopen. Dat
-- vastleggen is een eigen migratie met een eigen inventarisatie waard.
update public.goals set goal_type = 'net_worth'   where goal_type = 'wealth';
update public.goals set goal_type = 'debt_payoff' where goal_type = 'debt';

-- ══ Restrisico, bewust geaccepteerd ══════════════════════════════════════════
-- Op een doel met ownership='shared' toont de SELECT-policy aan de partner ook de
-- koppelrijen van de doel-eigenaar, inclusief het asset_id/debt_id daarvan. Wijst
-- zo'n koppeling naar een NIET-gedeelde bezitting, dan ziet de partner een uuid
-- die hij zelf niet kan oplossen: de SELECT-policy op assets/debts blijft dicht,
-- dus er komt geen naam, bedrag of type mee. Dat is inherent aan de gevraagde
-- gedeelde-doel-leesregel en niet weg te ontwerpen zonder die tak te schrappen.
-- Wie dat te ruim vindt, beperkt de EXISTS-tak tot koppelingen naar objecten die
-- zélf ownership='shared' dragen — dat is een aparte migratie, geen stille tweak.

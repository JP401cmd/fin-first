-- ADR 0103 · sluit het "twee grondslagen in één tijdreeks"-gat van de snapshot-cron.
--
-- WAAROM
-- ──────────────────────────────────────────────────────────────────────────────
-- Sinds de correctie van 11 aug 2026 betekent "uit je budgetten" de GEREALISEERDE
-- bedragen per budgetpost over een rollend 12-maands venster, gemeten met
-- `public.tx_month_aggregate` (lib/budget-realized.ts). De twee SESSIE-paden naar
-- `net_worth_snapshots` (POST /api/snapshots en GET /api/snapshots/auto) doen dat
-- ook; de nachtelijke CRON (app/api/snapshots/cron/route.ts) kon het niet.
--
-- De reden: deze functie is SECURITY INVOKER en leunt dus volledig op de RLS van
-- `transactions` voor haar scope. De cron draait op de service-role — een rol met
-- `rolbypassrls = true` (gemeten tegen `pg_roles`, 11-08-2026) — waar `auth.uid()`
-- NULL is en RLS wordt gepasseerd. Zonder afbakening zou de functie daar over de
-- transacties van ÁLLE gebruikers aggregeren. Er was geen parameter om per
-- gebruiker af te bakenen, dus viel de cron terug op de GEPLANDE budgetlimieten.
--
-- Gevolg: maanden waarin de gebruiker de app niet opende dragen een snapshot op
-- planning-grondslag, alle andere op realisatie. Een tijdreeks met twee
-- grondslagen corrigeert zichzelf nooit — `savings_rate`, `freedom_percentage` en
-- `fire_age` verspringen dan zonder financiële gebeurtenis.
--
-- WAT DEZE MIGRATIE DOET
-- ──────────────────────────────────────────────────────────────────────────────
-- Twee nieuwe, optionele parameters die de scope ALLEEN KUNNEN VERSMALLEN:
--
--   p_user_id      uuid default null  -- beperk tot de transacties van deze gebruiker
--   p_household_id uuid default null  -- én tot de als 'shared' gemarkeerde rijen
--                                     -- van dit huishouden
--
-- Ze spiegelen samen exact het predicaat van de bestaande SELECT-policy
-- "View own or shared transactions" (gemeten tegen `pg_policies`, 11-08-2026):
--
--   (select auth.uid()) = user_id
--   OR (ownership = 'shared' AND household_id IS NOT NULL
--       AND household_id = (select user_household_id()))
--
-- Dat is geen toevalligheid maar de eis: het sessie-pad haalt het aggregaat met
-- `ownOnly = false` op, dus RLS-BREED — eigen rijen PLUS de gedeelde rijen van de
-- partner. Zou de cron alleen op `user_id = p_user_id` afbakenen, dan telde een
-- gedeeld boodschappenbudget waarop de partner het meeste boekt bij deze
-- gebruiker structureel te laag mee, en dreef de cron-snapshot alsnog af van het
-- dashboard. Dit is dezelfde fout die eerder al één keer is gemaakt met de
-- budget-scope van de snapshot-routes (zie `selectBudgetsForBasisForUser` in
-- lib/household/budget-share.ts, waarvan dit predicaat de tweeling is).
--
-- DIT IS GEEN RLS-BYPASS — HET BEWIJS
-- ──────────────────────────────────────────────────────────────────────────────
-- De functie blijft SECURITY INVOKER (`prosecdef = false`), dus het lichaam draait
-- met de rechten én de RLS van de AANROEPER. Het nieuwe predicaat is met AND aan
-- de bestaande WHERE geknoopt. Een conjunct kan per definitie alleen rijen
-- WEGNEMEN, nooit toevoegen. Daaruit volgt per rol:
--
--   • authenticated — de uitkomst is een DEELVERZAMELING van wat de SELECT-policy
--     toelaat. Geeft een kwaadwillende aanroeper het user-id (of household-id) van
--     een vreemde mee, dan snijdt zijn nieuwe filter door een verzameling waar die
--     rijen sowieso niet in zaten: hij krijgt 0 RIJEN, GÉÉN FOUT, en leert dus ook
--     niets uit het verschil tussen "bestaat niet" en "mag niet". De functie kan
--     nog steeds geen enkele rij teruggeven die dezelfde aanroeper niet óók met een
--     gewone `select * from transactions` zou zien.
--
--     Geeft hij het id van zijn EIGEN huishoudpartner mee, dan krijgt hij precies
--     de rijen die die partner uitdrukkelijk als 'shared' met hem deelt — rijen die
--     hij vandaag al ziet, en waarvan hij de som al kon isoleren door het verschil
--     te nemen tussen een aanroep met `p_own_only = true` en één met `false`. Nul
--     nieuwe informatie; alleen een kortere weg naar iets wat al van hem was.
--
--   • anon — de SELECT-policy op `transactions` staat `to authenticated` (gemeten
--     tegen `pg_policies`, 11-08-2026). Anon matcht dus geen enkele permissive
--     policy en krijgt 0 rijen, ongeacht welke parameters hij meegeeft. Ongewijzigd
--     gedrag: 0 rijen, géén fout (dat is hier conventie, zie de grants hieronder).
--
--   • service_role — passeert RLS al (`rolbypassrls = true`) en zag vóór deze
--     migratie dus de HELE tabel. De parameters zijn daar het enige dat de scope
--     versmalt. Ze verruimen daar niets; ze maken een reeds ongelimiteerd pad
--     begrensbaar. De verantwoordelijkheid voor het meegeven van het juiste id
--     ligt bij de aanroeper, exact zoals bij `selectBudgetsForBasisForUser` en
--     `selectUnlinkedBankAccountsForUser`.
--
-- Er is dus GEEN SECURITY DEFINER nodig, en dat is bewust: een definer-functie zou
-- hier een eigen autorisatiecheck moeten dragen die kan verlopen ten opzichte van
-- de policy die ze nabootst. Een puur restrictief AND-filter op een invoker-functie
-- heeft die faalvorm per constructie niet.
--
-- WAAROM GEEN OVERLOAD (bewuste ontwerpkeuze)
-- ──────────────────────────────────────────────────────────────────────────────
-- Het alternatief was een tweede functie naast de bestaande. Dat is hier verworpen:
--
--   1. PostgREST kiest een functie op basis van de SET argumentnamen in de body.
--      Zou de nieuwe functie DEFAULTS op de extra parameters dragen, dan is een
--      bestaande aanroep met {p_from, p_to, p_own_only} een geldige kandidaat voor
--      BEIDE functies. PostgREST kan dan niet kiezen (PGRST203, "Could not choose
--      the best candidate function") en alle dertien bestaande grondslag-
--      oppervlakken vallen tegelijk om. Dat risico is niet de moeite waard.
--   2. Zonder defaults zouden we twee kopieën van hetzelfde lichaam onderhouden —
--      en dan is de eerste wijziging die er maar aan één kant in gaat een stille
--      divergentie tussen dashboard en snapshot. Precies het soort drift dat
--      ADR 0103 juist opruimt.
--
-- Daarom: DROP + CREATE van één functie met defaults op de nieuwe parameters. Na
-- deze migratie bestaat er exact ÉÉN `public.tx_month_aggregate`, dus PostgREST
-- kan niet twijfelen, en bestaande aanroepen met drie argumenten blijven
-- ongewijzigd werken (de nieuwe parameters defaulten naar NULL = geen extra
-- filter). Migraties draaien in een transactie, dus het gat tussen DROP en CREATE
-- is nooit zichtbaar voor een lezer. Niets in de database hangt aan deze functie
-- (geen views, geen triggers), dus CASCADE is niet nodig en zou hier gevaarlijk zijn.
--
-- INDEXEN: geen nieuwe nodig. `idx_transactions_user_date (user_id, date DESC)` en
-- `idx_transactions_household_shared_date (household_id, date DESC) WHERE
-- ownership = 'shared'` dekken beide takken van het nieuwe predicaat al (gemeten
-- tegen `pg_indexes`, 11-08-2026).
--
-- IDEMPOTENT: beide signaturen worden met `if exists` gedropt, dus deze migratie is
-- veilig her-uitvoerbaar.

-- De oude 3-argument-signatuur (migratie 20260719131916) én de nieuwe, zodat een
-- tweede uitvoering niet op "function already exists" strandt.
drop function if exists public.tx_month_aggregate(date, date, boolean);
drop function if exists public.tx_month_aggregate(date, date, boolean, uuid, uuid);

create function public.tx_month_aggregate(
  p_from date,
  p_to date,
  p_own_only boolean default false,
  p_user_id uuid default null,
  p_household_id uuid default null
)
returns table (
  month text,
  budget_id uuid,
  transaction_type text,
  sum_positief numeric,
  sum_negatief numeric,
  count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    to_char(t.date, 'YYYY-MM')                                    as month,
    t.budget_id,
    t.transaction_type,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0)::numeric as sum_positief,
    coalesce(sum(t.amount) filter (where t.amount < 0), 0)::numeric as sum_negatief,
    count(*)::bigint                                              as count
  from public.transactions t
  where t.date >= p_from
    and t.date <  p_to
    and (not p_own_only or t.user_id = (select auth.uid()))
    -- EXTRA AND-FILTER, NOOIT EEN VERRUIMING. p_user_id NULL = deze conjunct is
    -- waar voor elke rij, dus het gedrag van vóór deze migratie. Is hij gezet, dan
    -- blijft alleen over wat óók door de RLS-policy van de aanroeper komt (voor
    -- service_role: alleen deze scope, want die rol passeert RLS). Het predicaat
    -- spiegelt "View own or shared transactions" regel voor regel.
    and (
      p_user_id is null
      or t.user_id = p_user_id
      or (
        t.ownership = 'shared'
        and t.household_id is not null
        and t.household_id = p_household_id
      )
    )
  group by 1, 2, 3
$$;

-- GRANTS — spiegelt de bestaande (migratie 20260719131916), met één toevoeging.
--
-- PUBLIC krijgt niets. `anon` BLIJFT bewust staan: die rol draait de functie óók
-- onder RLS en matcht geen enkele SELECT-policy op `transactions`, dus ze levert
-- daar 0 rijen op. Het intrekken van dat recht zou een uitgelogde server-render
-- geen lege set maar een `permission denied for function` (42501) opleveren — een
-- gedragsregressie op het pad dat vandaag stilletjes goed gaat. De conventie in
-- deze codebase is expliciet "0 rijen, géén fout"; die houden we.
--
-- `service_role` staat er nu EXPLICIET bij. Die rol had het recht al (gemeten
-- tegen `pg_proc.proacl`, 11-08-2026), maar uitsluitend via een project-brede
-- ALTER DEFAULT PRIVILEGES op schema public. De snapshot-cron is nu functioneel
-- afhankelijk van dit recht, en dan hoort het in de migratie te staan in plaats van
-- als bijwerking van een instelling die buiten dit bestand kan wijzigen.
revoke all on function public.tx_month_aggregate(date, date, boolean, uuid, uuid) from public;
grant execute on function public.tx_month_aggregate(date, date, boolean, uuid, uuid)
  to authenticated, anon, service_role;

comment on function public.tx_month_aggregate(date, date, boolean, uuid, uuid) is
  'Maand-aggregaat (som pos/neg + count) per (maand, budget_id, transaction_type) over [p_from, p_to). SECURITY INVOKER — de RLS van transactions geldt onverkort. p_own_only=true beperkt tot eigen rijen (excl. gedeeld huishouden). p_user_id/p_household_id (ADR 0103) zijn een puur RESTRICTIEF extra AND-filter dat de policy "View own or shared transactions" spiegelt, zodat een service-role-aanroeper (snapshot-cron) per gebruiker kan afbakenen; voor een authenticated aanroeper met een vreemd id levert dat 0 rijen en geen fout — het is nooit een RLS-bypass.';

-- PostgREST herleest zijn schema-cache normaal via de Supabase-event-trigger; na
-- een signatuurwijziging vragen we het expliciet, zodat de nieuwe parameters
-- meteen aanroepbaar zijn.
notify pgrst, 'reload schema';

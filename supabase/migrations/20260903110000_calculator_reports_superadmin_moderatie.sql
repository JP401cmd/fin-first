-- /beheer/calculator-reports werkend maken: beheer mag de meldingen-inbox
-- lezen én afhandelen.
--
-- Kaart: "calculator_reports mist superadmin-select-policy — /beheer/
-- calculator-reports toont alleen eigen rijen" (P2).
-- Alle policy-feiten hieronder zijn gemeten tegen de LIVE database op
-- 03-09-2026 (`pg_policies`, `pg_roles`), niet gelezen uit migratiebestanden
-- (ADR 0045).
--
-- ── Wat er kapot is, en hoe stil ─────────────────────────────────────────────
-- Gemeten op `calculator_reports`: er bestaan precies twee policies —
-- "Users can submit reports" (INSERT, `with check auth.uid() = reporter_id`,
-- correct) en "Users can read own reports" (SELECT, `auth.uid() = reporter_id`).
-- Er is GEEN superadmin-SELECT en er is HELEMAAL GEEN UPDATE-policy.
--
-- `app/(app)/beheer/calculator-reports/page.tsx` leest met `createClient()` —
-- de anon RLS-client met de sessie van de beheerder. De inbox toont dus alleen
-- meldingen die de beheerder ZELF heeft ingediend. Dat was de melding op de
-- kaart, en die klopt.
--
-- Bij het narekenen bleek het defect groter dan gemeld, en erger van soort. De
-- twee server-actions in `actions.ts` doen ná hun `isSuperAdmin()`-check hun
-- UPDATE óók via diezelfde RLS-client:
--
--   * `markReviewedAction`  → `update({status:'reviewed'}) on calculator_reports`
--     — er is geen UPDATE-policy, dus dit raakt 0 rijen.
--   * `hideCalculatorAction` → `update({is_public:false}) on custom_calculators`
--     — daar is de UPDATE-policy strikt eigen-rij
--       (`auth.uid() = user_id`, gemeten), dus op andermans rekenhulp raakt dit
--       eveneens 0 rijen.
--
-- Een Supabase-`.update()` die 0 rijen raakt geeft `error: null`. Beide acties
-- geven daarop `{ ok: true }` terug en `revalidatePath()` ververst de lijst.
-- De beheerder ziet dus een geslaagde actie terwijl er niets gebeurde — en
-- omdat de lijst tóch al leeg was, viel dat nergens op. Precies de klasse
-- "stil verkeerd" die `20260804101500` beschrijft: luid kapot was hier beter
-- geweest. De hele moderatiefunctie is daarmee non-functioneel voor alles wat
-- niet van de beheerder zelf is.
--
-- Alleen de SELECT repareren zou de inbox vullen met meldingen die de
-- beheerder vervolgens niet kan afhandelen. Daarom staan de twee UPDATE-
-- policies hier in hetzelfde bestand: ze zijn samen één werkend pad.
--
-- ── Waarom RLS-policies en niet service-role (ADR 0006) ─────────────────────
-- ADR 0006 verbiedt brede `is_superadmin()`-policies op PERSOONLIJKE
-- FINANCIËLE tabellen (assets, debts, transactions, profiles,
-- bank_connection_accounts) omdat de domein-loaders daar bewust op RLS
-- leunen voor row-scoping: een superadmin-sessie zag daardoor op gewone
-- app-pagina's ineens ieders data. Datzelfde ADR houdt expliciet ruimte voor
-- OPERATIONELE tabellen ("feedback, error_logs, mail_log, job_runs, ai_usage
-- behouden hun superadmin-policies").
--
-- `calculator_reports` valt in de tweede categorie: een moderatie-inbox met
-- (reporter_id, calculator_id, reason, status) — geen financiële gegevens. De
-- vorm hieronder is dan ook letterlijk gespiegeld op de jongste vertegenwoordiger
-- van dat patroon, `20260806104500_create_user_reports.sql` r.162-183 (zelfde
-- soort inbox, aangemaakt ná ADR 0006).
--
-- De ADR-0006-valkuil is wél expliciet nagetrokken in plaats van aangenomen:
-- leunt er ergens een gewone gebruikerspagina op RLS-scoping van deze tabellen?
--   * `calculator_reports` wordt buiten /beheer nergens gelezen — de enige
--     andere aanraking is de INSERT in `app/api/calculators/[id]/report`.
--     Die route doet géén throttle-telling (anders dan `user_reports`), dus de
--     verbrede SELECT verandert daar niets.
--   * `custom_calculators` krijgt daarom BEWUST GEEN superadmin-SELECT. De
--     bibliotheek (`/toekomst/bibliotheek`), `/toekomst/rekenhulp` en
--     `/toekomst` lezen die tabel wél op RLS-scoping (`is_public OR eigen`).
--     Een superadmin-SELECT zou daar ongepubliceerde rekenhulpen van anderen
--     laten opduiken in een gewone gebruikerspagina — exact het lek dat ADR
--     0006 heeft opgeruimd. Alleen de UPDATE gaat open, en een UPDATE-policy
--     kan per definitie geen rijen lekken.
--
-- ── Vormkeuzes (dezelfde twee als in 20260806104500) ────────────────────────
-- 1. ÉÉN samengevoegde SELECT-policy (own OR superadmin) in plaats van twee
--    permissieve policies naast elkaar. Twee permissieve SELECT-policies op
--    dezelfde rol laat Postgres allebei per query evalueren en levert de
--    Supabase-lint `multiple_permissive_policies` op.
-- 2. `(select public.is_superadmin())` in plaats van kaal `is_superadmin()`.
--    Die functie is STABLE SECURITY DEFINER met een eigen SELECT op `profiles`;
--    SECURITY DEFINER-functies worden nooit ge-inlined en STABLE-functies niet
--    constant-gefold, dus kaal draait hij PER RIJ. De scalar-subquery-wrapper
--    maakt er een InitPlan van — identieke semantiek, alleen plannerkosten
--    wijzigen (ADR 0048).
--
-- ── Rolset: `to authenticated`, niet `to public` ────────────────────────────
-- De bestaande policies staan op `public`. De nieuwe expressies roepen
-- `is_superadmin()` aan, en `anon` heeft daar geen EXECUTE op (gemeten via
-- `has_function_privilege`, 03-09-2026: authenticated = true, anon = false).
-- Op `to public` zou een anon-poging daardoor "permission denied for function"
-- geven in plaats van een schone deny — het foutgedrag dat
-- `20260719090650_perf_rls_merged_select_authenticated.sql` moest repareren.
-- `anon` verliest hier niets: `(select auth.uid())` is daar NULL, dus er
-- passeerde toch al geen rij.
--
-- ── Toegangsmodel na deze migratie ──────────────────────────────────────────
--   calculator_reports
--     INSERT — alleen op eigen naam (`reporter_id = auth.uid()`), ongewijzigd.
--     SELECT — eigen meldingen OF superadmin leest alles.
--     UPDATE — alleen superadmin (triage: status open → reviewed). Een melder
--              mag zijn eigen melding NIET bewerken: een verzonden melding is
--              een bericht, geen bewerkbaar document.
--     DELETE — nog steeds door niemand; meldingen verdwijnen niet.
--   custom_calculators
--     UPDATE — eigen rekenhulp (ongewijzigd) OF superadmin (moderatie:
--              `is_public` uitzetten). SELECT/INSERT/DELETE ongewijzigd.
--
-- ── Wat hier bewust NIET gebeurt ────────────────────────────────────────────
-- De beheerpagina toont bij een al verborgen rekenhulp van iemand anders
-- "(verwijderde calculator)" in plaats van de naam, omdat de SELECT op
-- `custom_calculators` `is_public = true OR eigen` blijft. Dat is de prijs van
-- de ADR-0006-keuze hierboven en een bewuste weeffout, geen vergissing: de
-- moderatieflow zelf werkt (je verbergt publieke rekenhulpen), alleen het
-- etiket achteraf is armer. Wil beheer die namen tóch zien, dan hoort dat via
-- een service-role-leespad in een `/api/admin/*`-route mét audit-log, niet via
-- een verbrede SELECT-policy.

-- ── calculator_reports: lezen ───────────────────────────────────────────────
-- Vervangt "Users can read own reports" door de samengevoegde vorm; de oude
-- naam wordt gedropt zodat er geen tweede permissieve policy blijft staan.
drop policy if exists "Users can read own reports" on public.calculator_reports;
drop policy if exists "calculator_reports select own or superadmin" on public.calculator_reports;
create policy "calculator_reports select own or superadmin" on public.calculator_reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (select public.is_superadmin())
  );

-- ── calculator_reports: triage ──────────────────────────────────────────────
drop policy if exists "calculator_reports superadmin update" on public.calculator_reports;
create policy "calculator_reports superadmin update" on public.calculator_reports
  for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

-- ── custom_calculators: moderatie-ingreep ───────────────────────────────────
-- Naast de bestaande eigen-rij UPDATE, niet in plaats daarvan. Twee
-- permissieve UPDATE-policies is hier de juiste vorm: de eigenaar en de
-- moderator hebben verschillende gronden, en samenvoegen zou de eigen-rij-
-- policy laten meeverwijzen naar `is_superadmin()` voor élke gebruiker die
-- zijn eigen rekenhulp opslaat.
drop policy if exists "custom_calculators superadmin update" on public.custom_calculators;
create policy "custom_calculators superadmin update" on public.custom_calculators
  for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

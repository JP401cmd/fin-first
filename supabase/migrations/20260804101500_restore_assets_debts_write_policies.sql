-- Drift-herstel: de SCHRIJF-policies van `assets`, `debts`,
-- `recurring_transactions`, `goals` en `net_worth_snapshots` terug in de repo.
--
-- ── Wat er mis is ─────────────────────────────────────────────────────────────
-- Op de LIVE database kan een ingelogde gebruiker zijn eigen bezittingen en
-- schulden gewoon toevoegen, wijzigen en verwijderen. In de MIGRATIEBESTANDEN
-- kan hij dat niet. Die twee sporen lopen sinds 19 juli 2026 uiteen, en het
-- verschil is niet cosmetisch: een verse `supabase db reset` of een preview-
-- branch levert een database op waarin deze vijf tabellen alleen-lezen zijn.
-- Elke onboarding, elke bezitting-toevoegen-knop en elke schuld-aflossing loopt
-- daar stuk op "new row violates row-level security policy" — en niemand merkt
-- dat, want de omgeving waarin het WEL werkt (prod) is precies de omgeving waar
-- we niet resetten.
--
-- Bij `recurring_transactions` is het bovendien ERGER dan een harde fout, en dat
-- is de directe aanleiding om deze migratie te verbreden. `public.delete_bank_
-- account()` (zie `20260804102500`) draait als SECURITY INVOKER en zet bij het
-- verwijderen van een rekening de terugkerende regels stop. Zonder UPDATE-policy
-- raakt die stap op een verse database 0 rijen — zónder fout. De regels blijven
-- dan actief en blijven de cashflow-prognose voeden voor een rekening die niet
-- meer bestaat. Stil verkeerd is duurder dan luid kapot.
--
-- ── Waar het vandaan komt ─────────────────────────────────────────────────────
-- `20260719090108_perf_rls_initplan_consolidatie.sql`, vijf keer hetzelfde
-- patroon — FOR ALL droppen, alleen een merged SELECT terugzetten:
--
--   * regel 230-234 (assets)                 — "Users can manage own assets"
--   * regel 285-290 (debts)                  — "Users can manage own debts"
--   * regel 314-319 (net_worth_snapshots)    — "Users can manage own snapshots"
--   * regel 363-368 (recurring_transactions) — "Users can manage own recurring_transactions"
--   * `goals` — idem; de drie live schrijf-policies staan alleen als COMMENTAAR
--     in `20260711151755_add_goals_metadata.sql` r.44-46, nooit als uitgevoerd
--     statement. Dat commentaar is precies het bewijs dat ze bestonden én dat
--     niemand doorhad dat ze nergens werden aangemaakt.
--
-- `transactions` heeft dit gat NIET: daar zet dezelfde migratie op r.383-385 wél
-- drie granulaire schrijf-policies terug. Nagetrokken, niet aangenomen.
--
-- Dat was geen vergissing in de uitvoering maar een aanname in de kop, regel
-- 17-19 van datzelfde bestand:
--
--     "Redundante 'manage own' (FOR ALL)-policies die volledig gedekt worden
--      door granulaire per-actie-policies worden gedropt (geen toegang gaat
--      verloren)."
--
-- Die aanname was WAAR op remote — daar bestonden "Users can insert own
-- assets", "... update own assets", "... delete own assets" en hun drie
-- debts-tegenhangers al, aangemaakt buiten migraties om (dashboard/`apply_
-- migration` zonder bijbehorend bestand — precies de drift die ADR 0045 in
-- kaart bracht). Maar in de migratieketen bestonden ze NOOIT. Voor een verse
-- database gold dus wél "toegang gaat verloren": de FOR ALL was daar niet
-- redundant maar het ENIGE schrijfpad.
--
-- ── Wat deze migratie doet ────────────────────────────────────────────────────
-- Precies wat ADR 0045 (`docs/adr/0045-migratie-baseline-resync-en-drift-hek.md`,
-- besluit 1-4) voorschrijft voor dit geval: een documentaire, additieve,
-- idempotente migratie die de LIVE toestand exact codificeert, zodat repo en
-- remote weer één verhaal vertellen.
--
--   besluit 1 — gegenereerd uit remote-introspectie (`pg_policies`, gemeten
--               04-08-2026), niet met de hand verzonnen;
--   besluit 2 — idempotent (`drop policy if exists` + `create policy`) en een
--               NO-OP op productie: de vijftien policies worden daar vervangen
--               door letterlijk zichzelf. (Vijftien: 5 tabellen × 3 acties. De
--               kop sprak eerst van "zes" — dat sloeg op assets + debts, vóór
--               de verbreding naar recurring_transactions, goals en
--               net_worth_snapshots. Op een bestand dat als drift-hek dient is
--               de telling geen bijzaak, dus ze is hier rechtgezet.);
--   besluit 3 — puur additief, geen history-rewrite, geen reset;
--   besluit 4 — dit bestand IS het hek: vanaf nu staat het schrijfpad in git en
--               is het vanuit git te reviewen.
--
-- ── Twee dingen die met opzet NIET "verbeterd" worden ─────────────────────────
--
-- (a) DE UPDATE-POLICIES KRIJGEN GEEN `with check`. Live staat daar `with_check
--     = null`, en dat is geen gat: Postgres gebruikt bij een UPDATE-policy
--     zonder expliciete `WITH CHECK` de `USING`-expressie óók als post-write-
--     check. De nieuwe rij moet dus net zo goed `user_id = auth.uid()` hebben —
--     een rij naar een andere eigenaar wegschrijven kan niet. Er een expliciete
--     `with check` bij zetten zou de eindtoestand niet veranderen maar wél van
--     een drift-HERSTEL stiekem een gedragsWIJZIGING maken, en dan is deze
--     migratie geen no-op meer op prod. Dat is precies wat we hier niet willen.
--
--     (Let op de asymmetrie met `bank_accounts`: daar staat de `with check` wél
--     expliciet, en de nagekomen aantekening in `20260730210321` waarschuwt om
--     die niet te verzwakken. Dat is geen tegenspraak — daar bestaat een
--     BEFORE-trigger die op `new.user_id` vertrouwt en dus een harde,
--     zichtbare `with check` als fundament wil. Op `assets`/`debts` hangt geen
--     zo'n trigger; daar is de impliciete USING-als-check de bestaande,
--     werkende situatie en het herstellen ervan is het hele punt.)
--
-- (b) DE SELECT-POLICIES WORDEN NIET AANGERAAKT — er is dáár geen drift.
--     Nagetrokken in plaats van aangenomen: `20260719090108` schrijft ze
--     inderdaad `to public` (r.233 / r.289), maar de allereerste opvolger,
--     `20260719090650_perf_rls_merged_select_authenticated.sql` (r.15 en r.21),
--     zet ze in dezelfde uitrol met `alter policy … to authenticated` recht —
--     met een goede reden: de huishouden-tak roept `user_household_id()` aan en
--     `anon` heeft daar geen EXECUTE op, dus een anon-SELECT gaf een FOUT in
--     plaats van een lege set. De migratieketen eindigt dus al op
--     `{authenticated}`, exact zoals live. Eén regel, en het is deze: de
--     bestaande keten klopt, dus we voegen er niets aan toe. Een derde
--     `alter policy` zou alleen ruis zijn en de indruk wekken dat hier iets
--     mis was.
--
-- ── Rolset van de schrijf-policies: `public`, net als live ────────────────────
-- Ook geen leak, en om dezelfde reden als hierboven bewust ongemoeid: `anon`
-- heeft geen sessie, dus `(select auth.uid())` is null en `null = user_id`
-- evalueert naar NULL → geen rij passeert. En anders dan bij de SELECT-policies
-- roepen deze vijftien expressies GEEN `user_household_id()` aan, dus het
-- foutgedrag dat `20260719090650` moest repareren (permission denied i.p.v.
-- lege set) kan hier niet optreden. `to public` is hier dus een schone deny.
--
-- Eigendom blijft strikt EIGEN RIJ — schrijven is nadrukkelijk NIET
-- huishoud-verbreed, ook al is lezen dat wel. Een partner mag een gedeelde
-- bezitting zien, niet wijzigen. Deze migratie verandert daar niets aan.

-- ── assets ────────────────────────────────────────────────────────────────────
drop policy if exists "Users can insert own assets" on public.assets;
create policy "Users can insert own assets" on public.assets
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Geen `with check` — zie (a) in de kop. USING doet hier dubbel dienst.
drop policy if exists "Users can update own assets" on public.assets;
create policy "Users can update own assets" on public.assets
  for update to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own assets" on public.assets;
create policy "Users can delete own assets" on public.assets
  for delete to public
  using ((select auth.uid()) = user_id);

-- ── debts ─────────────────────────────────────────────────────────────────────
drop policy if exists "Users can insert own debts" on public.debts;
create policy "Users can insert own debts" on public.debts
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Geen `with check` — zie (a) in de kop.
drop policy if exists "Users can update own debts" on public.debts;
create policy "Users can update own debts" on public.debts
  for update to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own debts" on public.debts;
create policy "Users can delete own debts" on public.debts
  for delete to public
  using ((select auth.uid()) = user_id);

-- ── recurring_transactions ────────────────────────────────────────────────────
-- De blokkade uit de kop: zonder de UPDATE-policy zet `delete_bank_account()`
-- stil 0 terugkerende regels stop op een verse database.
drop policy if exists "Users can insert own recurring transactions" on public.recurring_transactions;
create policy "Users can insert own recurring transactions" on public.recurring_transactions
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Geen `with check` — zie (a) in de kop.
drop policy if exists "Users can update own recurring transactions" on public.recurring_transactions;
create policy "Users can update own recurring transactions" on public.recurring_transactions
  for update to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own recurring transactions" on public.recurring_transactions;
create policy "Users can delete own recurring transactions" on public.recurring_transactions
  for delete to public
  using ((select auth.uid()) = user_id);

-- ── goals ─────────────────────────────────────────────────────────────────────
drop policy if exists "Users can insert own goals" on public.goals;
create policy "Users can insert own goals" on public.goals
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Geen `with check` — zie (a) in de kop.
drop policy if exists "Users can update own goals" on public.goals;
create policy "Users can update own goals" on public.goals
  for update to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own goals" on public.goals;
create policy "Users can delete own goals" on public.goals
  for delete to public
  using ((select auth.uid()) = user_id);

-- ── net_worth_snapshots ───────────────────────────────────────────────────────
drop policy if exists "Users can insert own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can insert own net worth snapshots" on public.net_worth_snapshots
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Geen `with check` — zie (a) in de kop.
drop policy if exists "Users can update own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can update own net worth snapshots" on public.net_worth_snapshots
  for update to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can delete own net worth snapshots" on public.net_worth_snapshots
  for delete to public
  using ((select auth.uid()) = user_id);

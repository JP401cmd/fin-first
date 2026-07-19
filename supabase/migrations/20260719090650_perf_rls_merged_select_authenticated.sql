-- Performance-sanering fase 1 — correctie op Migratie 2
--
-- WAAROM: de in Migratie 2 samengevoegde eigenaar-OF-huishouden SELECT-policies kregen bewust
-- `to public` om de oude eigenaar-SELECT-rolset (public) te behouden. De huishouden-tak roept echter
-- de SECURITY DEFINER-helper user_household_id() aan, en de anon-rol heeft daar GEEN execute-recht op.
-- Gevolg: een anon-SELECT op deze tabellen gaf voorheen 0 rijen (schone deny), maar geeft nu een
-- "permission denied for function user_household_id"-FOUT — geen datalek (anon ziet nog steeds niets),
-- maar wel een gedragswijziging (lege set -> fout). Ontdekt met de anon-leak-check.
--
-- FIX: zet deze policies op `to authenticated`. Anon heeft dan geen SELECT-policy meer op deze tabellen
-- -> 0 rijen (default deny), exact zoals vóór de migratie, en zonder fout. Alle échte leespaden
-- (ingelogde `authenticated`-client) blijven identiek; beheer via service-client passeert RLS (ADR 0006).
-- Deze tabellen bevatten privé financiële data en horen sowieso authenticated-only te zijn.

alter policy "Users can view own or shared assets" on public.assets to authenticated;
alter policy "Users view own or shared bank_accounts" on public.bank_accounts to authenticated;
alter policy "Manage own or shared budget amounts" on public.budget_amounts to authenticated;
alter policy "View own or shared budget rollovers" on public.budget_rollovers to authenticated;
alter policy "View own or shared budgets" on public.budgets to authenticated;
alter policy "Update own or shared budgets" on public.budgets to authenticated;
alter policy "View own or shared debts" on public.debts to authenticated;
alter policy "View own or shared goals" on public.goals to authenticated;
alter policy "View own or shared life_events" on public.life_events to authenticated;
alter policy "View own or shared net worth snapshots" on public.net_worth_snapshots to authenticated;
alter policy "View own or shared recurring transactions" on public.recurring_transactions to authenticated;
alter policy "View own or shared transaction splits" on public.transaction_splits to authenticated;
alter policy "View own or shared transactions" on public.transactions to authenticated;
alter policy "View own or shared valuations" on public.valuations to authenticated;

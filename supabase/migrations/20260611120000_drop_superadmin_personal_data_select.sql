-- Superadmin-inzage liep via brede RLS-SELECT-policies op persoonlijke
-- financiële tabellen (toegevoegd 2026-06-10 voor beheer 2.0 supportview).
-- Daardoor lekten ALLE gebruikersrijen in elke gewone app-query van een
-- superadmin-sessie: de perspectief-loaders en domein-loaders vertrouwen op
-- RLS voor row-scoping (bewust geen user_id-filter), dus een superadmin zag
-- op /overzicht, /toekomst etc. de data van álle gebruikers.
--
-- Supportview en AVG-export lezen voortaan via de service-role-client in
-- /api/admin/user-diagnose en /api/admin/user-export (expliciete
-- superadmin-check + audit-log). RLS geeft een interactieve sessie nooit
-- meer cross-user leesrecht op persoonlijke financiële data.

drop policy if exists "assets superadmin select" on public.assets;
drop policy if exists "debts superadmin select" on public.debts;
drop policy if exists "transactions superadmin select" on public.transactions;
drop policy if exists "profiles superadmin select" on public.profiles;
drop policy if exists "bank_connection_accounts superadmin select" on public.bank_connection_accounts;

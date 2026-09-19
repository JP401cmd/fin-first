-- TPR-02 vervolg: "geen eigen rendement" opslaanbaar maken.
-- Eigenaarsbesluit 19-09-2026 (optie A2), vastgelegd als ADR 0166.
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- `public.assets.expected_return` is `numeric NOT NULL DEFAULT 0`. Daardoor kan
-- de app twee wezenlijk verschillende dingen niet uit elkaar houden:
--   * "deze bezitting rendeert bewust 0%" — een betaalrekening, bitcoin, een
--     afschrijvende auto (`TYPICAL_RETURNS` kent zes types met default 0), en
--   * "ik heb hier geen eigen aanname; reken met mijn profielrendement".
-- Fase 1 van TPR-02 (ca50854b3) bouwde de terugvalketting al in de kern:
-- `potRendement()` (lib/horizon-kernel/adapter/potten.ts) leest `null` als
-- "val terug op het profielrendement". Alleen kón `null` er via de database
-- nooit binnenkomen. Deze migratie opent dat pad.
--
-- ── Wat deze migratie doet ────────────────────────────────────────────────────
-- 1. `drop not null` — NULL wordt een geldige waarde en betekent voortaan
--    "geen eigen rendementsaanname".
-- 2. `drop default` — "weggelaten bij INSERT" betekent daarmee óók "geen eigen
--    aanname", in plaats van stil op 0 te landen. Gemeten tegen `pg_proc`
--    (19-09-2026) schrijven de twee live triggerfuncties
--    `fn_auto_link_bank_account_asset` en `ensure_companion_cash_asset` een
--    EXPLICIETE 0 en leunen dus niet op de default; die blijven ongewijzigd
--    correct (0% op een betaalrekening).
--
-- De CHECK-constraint `assets_expected_return_check`
-- (`expected_return >= -100 AND expected_return <= 100`) hoeft NIET te wijzigen:
-- een CHECK evalueert bij NULL naar NULL en passeert. Alleen het comment gaat
-- mee, zodat de volgende lezer niet de oude bedoeling leest.
--
-- ── BEWUST GEEN BACKFILL ──────────────────────────────────────────────────────
-- Gemeten 19-09-2026: 134 rijen over 16 gebruikers, waarvan 63 op exact 0
-- (cash 39, other 8, crypto 7, vehicle 5, physical 3, eigen_huis 1). Voor het
-- merendeel is 0 daar de JUISTE waarde. Een backfill `0 -> NULL` zou
-- betaalrekeningen en bitcoin op het profielrendement (bv. 7%) laten renderen in
-- ieders projectie — een stille verslechtering van bestaande plannen. Er is
-- bovendien geen kolom die vastlegt of de gebruiker het veld ooit heeft
-- aangeraakt, dus "nooit ingevuld" en "bewust 0" zijn achteraf niet te scheiden.
-- NULL geldt alleen VOORUIT.
--
-- ── RLS-dekking ───────────────────────────────────────────────────────────────
-- Additieve wijziging op een bestaande kolom: de kolom erft ongewijzigd de
-- bestaande policies op `public.assets` (SELECT huishoud-gedeeld, UPDATE strikt
-- eigen-rij). Geen nieuwe policy, geen nieuw schrijfpad, geen service-role.
-- Schrijfpaden blijven PATCH /api/assets/[id]/expected-return en POST /api/assets
-- (beide anon RLS-client). Er ontstaat geen onschrijfbare kolom.
--
-- ── De terugweg ───────────────────────────────────────────────────────────────
-- Niet omkeerbaar door terugdraaien (append-only), wél vooruit te corrigeren.
-- Blijkt dit fout, dan herstelt één correctiemigratie de oude situatie zonder
-- dataverlies:
--   update public.assets set expected_return = 0 where expected_return is null;
--   alter table public.assets alter column expected_return set default 0;
--   alter table public.assets alter column expected_return set not null;
-- Signaal dat het misging: bezittingen die ongevraagd op het profielrendement
-- groeien (vergelijk /toekomst met de bezittingenlijst), of NULL-rijen die
-- ontstaan zonder dat de gebruiker "geen eigen rendement" koos.

alter table public.assets alter column expected_return drop not null;
alter table public.assets alter column expected_return drop default;

comment on column public.assets.expected_return is
  'Verwacht jaarrendement in PROCENTEN (7 = 7%). NULL = geen eigen aanname -> '
  'terugval op het profielrendement via potRendement() '
  '(lib/horizon-kernel/adapter/potten.ts). 0 = een BEWUSTE 0% (betaalrekening, '
  'crypto, afschrijvend bezit). Zie ADR 0166.';

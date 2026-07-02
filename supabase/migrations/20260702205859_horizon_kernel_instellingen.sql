-- Horizon-kernel instellingen-datalaag (FASE 4).
--
-- Additief op `profiles`: twee nieuwe eigen-rij-instelvelden die de nieuwe
-- Horizon-kernel-adapter (`lib/horizon-kernel/adapter/`) consumeert. Vult de
-- gap-besluiten V4 (onttrekkingsprofiel-curve) en V7 (tekort-lening-rente) uit
-- `docs/horizon-excel-oracle-plan.md` §7. Twee andere besluiten (V5/V8) zijn
-- JSONB-shape-uitbreidingen op BESTAANDE kolommen (geen DDL) en worden hieronder
-- alleen als COMMENT gedocumenteerd.
--
-- BEWUST ADDITIEF: de bestaande `withdrawal_strategy`-enum (static|guardrails|
-- vpw|bucket) + `guardrail_*`-kolommen blijven ONGEMOEID — de draaiende v2-engine
-- leunt er nog op tot FASE 6. Deze migratie voegt alleen NIEUWE, NULL-bare velden
-- toe; bestaande rijen krijgen NULL → de adapter valt terug op de Excel-defaults
-- (P!B71-75 = 75/100/85/85/70; P!B25 = 0,05). Geen backfill nodig.
--
-- TOEGANG / RLS: geen nieuw RLS-werk. `profiles` heeft RLS aan en eigen-rij-
-- policies (SELECT/INSERT/UPDATE + een ALL-policy, alle op `auth.uid() = id`).
-- Postgres-RLS is RIJ-gebaseerd (niet kolom-gebaseerd), dus deze nieuwe kolommen
-- vallen automatisch onder dezelfde eigen-rij-policies: een gebruiker leest/schrijft
-- ze uitsluitend op de eigen profielrij. Geen service-role-pad; geen anon-toegang.

-- ── V4: onttrekkingsprofiel — 3-fasen-curve (go-go / slow-go / no-go) ────────────
alter table public.profiles
  add column if not exists withdrawal_profile_config jsonb;

comment on column public.profiles.withdrawal_profile_config is
  'V4 (horizon-kernel) — onttrekkingsprofiel 3-fasen-curve + guardrails-referentie. '
  'NULL = adapter gebruikt de Excel-defaults (P!B71-75). Shape (alle velden optioneel; '
  'ontbrekend veld valt per veld terug op de Excel-default): '
  '{ "gogo_tot_leeftijd": number (P!B71, default 75), '
  '"gogo_pct": number pct (P!B72, default 100), '
  '"slowgo_tot_leeftijd": number (P!B73, default 85), '
  '"slowgo_pct": number pct (P!B74, default 85), '
  '"nogo_pct": number pct (P!B75, default 70) }. '
  'Geparset door lib/withdrawal-strategy.ts#parseWithdrawalProfileConfig; geconsumeerd door '
  'lib/horizon-kernel/adapter/params.ts. Additief — vervangt de bestaande '
  'withdrawal_strategy-enum NIET (die blijft de v2-engine voeden tot FASE 6).';

-- ── V7: tekort-lening-jaarrente ─────────────────────────────────────────────────
alter table public.profiles
  add column if not exists deficit_loan_rate numeric;

-- Idempotent (security-gate 🟡): ADD CONSTRAINT kent geen IF NOT EXISTS, dus
-- een her-run (bv. CI die de lokale versienaam als ongedraaid ziet) mag hier
-- niet op breken.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_deficit_loan_rate_range'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_deficit_loan_rate_range
      check (deficit_loan_rate is null or (deficit_loan_rate >= 0 and deficit_loan_rate <= 1));
  end if;
end $$;

comment on column public.profiles.deficit_loan_rate is
  'V7 (horizon-kernel) — jaarrente op de tekort-lening (noodlening) als decimale fractie '
  '(0..1, bv. 0,05 = 5 procent). NULL = adapter gebruikt de Excel-default P!B25 = 0,05. '
  'Geconsumeerd door lib/horizon-kernel/adapter/params.ts + potten.ts (buildSchuldPotten). '
  'CHECK dwingt 0..1 af zodat een percentage nooit als heel getal (5) binnenkomt.';

-- ── V5: pot_rules.categorie_prios (JSONB shape-uitbreiding — GEEN DDL) ───────────
-- pot_rules is al JSONB; V5 voegt een OPTIONEEL veld `categorie_prios` toe: per
-- onderwerp (toename|afname|onttrekking) een map categorie -> prio 1..5, met
-- prio 5 = reserve (pas aanspreken bij depletie van de overige opties — de Excel-
-- reserve-pass). Ontbrekend veld = bestaand gedrag (de 3 orde-regels op 5 groepen)
-- byte-ongewijzigd. Geparset door lib/pot-rules.ts; geconsumeerd door de kernel-
-- adapter (prio-overgang.ts). Voorbeeld:
--   { "withdrawal_order_groups": [...], "surplus_group": "...",
--     "deficit_order_groups": [...],
--     "categorie_prios": {
--       "toename":      { "Spaargeld": 1, "Beleggingen": 2, "Eigen huis": 5 },
--       "afname":       { "Beleggingen": 1, "Spaargeld": 2 },
--       "onttrekking":  { "Spaargeld": 1, "Beleggingen": 2, "Eigen huis": 5 } } }
comment on column public.profiles.pot_rules is
  'Pot-voorkeuren (JSONB). Basis: withdrawal_order_groups / surplus_group / '
  'deficit_order_groups (3 orde-regels op 5 WealthGroups). V5-uitbreiding (optioneel): '
  '"categorie_prios" — per onderwerp {toename|afname|onttrekking} een map categorie->prio '
  '1..5 (5 = reserve, pas bij depletie). Ontbrekend = bestaand gedrag ongewijzigd. '
  'Geparset door lib/pot-rules.ts.';

-- ── V8: housing_strategy_config.fallback_age (JSONB shape-uitbreiding — GEEN DDL) ─
-- housing_strategy_config is al JSONB; V8 voegt een OPTIONEEL veld `fallbackAge`
-- toe (camelCase, consistent met de bestaande sleutels triggerAge/salePricePct): de
-- uiterste verkoop-/opeet-leeftijd voor de "wanneer nodig"-trigger (on_depletion).
-- Ontbrekend = adapter-default (Excel P!B59 = 75). Geparset door lib/housing-strategy.ts;
-- geconsumeerd door de kernel-adapter (woning-mapping).
comment on column public.profiles.housing_strategy_config is
  'Eigen-woning-strategie (JSONB, 4 modi). V8-uitbreiding (optioneel): "fallbackAge" '
  '(camelCase, als triggerAge/salePricePct) — uiterste verkoop-/opeet-leeftijd voor de '
  '"wanneer nodig"-trigger (on_depletion). Ontbrekend = adapter-default (Excel P!B59 = 75). '
  'Geparset door lib/housing-strategy.ts.';

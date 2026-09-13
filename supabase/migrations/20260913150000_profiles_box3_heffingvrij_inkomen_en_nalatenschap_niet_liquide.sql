-- TPR-12 (Plan-review Toekomst, 13 sep 2026) — twee Excel-defaults krijgen een app-veld.
--
-- Additief op `profiles`: twee nieuwe eigen-rij-instelvelden die de horizon-kernel-
-- adapter (`lib/horizon-kernel/adapter/params.ts`) consumeert. Tot deze migratie
-- rekende de kern met twee onzichtbare, niet-instelbare aannames uit het Excel-model:
--   - P!B54 "niet-liquide meetellen in nalatenschap" — hardcoded 'Nee' (buildEindstrategie);
--   - P!B91 heffingvrij inkomen per persoon per jaar — Excel-default 1800
--     (adapter/defaults.ts#EXCEL_HEFFINGVRIJ_INKOMEN_PP), alleen relevant in de
--     Box 3-tak "werkelijk rendement".
--
-- BEWUST NULL-BAAR, GEEN BACKFILL: NULL = "niet gekozen" → de adapter valt terug op
-- exact de bestaande kernel-default ('Nee' resp. 1800). Bestaande rijen krijgen NULL en
-- rekenen dus byte-identiek; pas een expliciete keuze verandert de projectie. Zelfde
-- patroon als `deficit_loan_rate` (migratie 20260702205859).
--
-- TOEGANG / RLS: geen nieuw RLS-werk. `profiles` heeft RLS aan met eigen-rij-policies
-- (`auth.uid() = id`); Postgres-RLS is rij-gebaseerd, dus de nieuwe kolommen vallen
-- automatisch onder dezelfde policies. Geen service-role-pad; geen anon-toegang.
-- Schrijfpaden: `PUT /api/fire-settings` (fire_legacy_include_illiquid, zod) en
-- `PUT /api/parameters` (box3_heffingvrij_inkomen, zod + PARAMETER_BANDS).
--
-- TERUGWEG: append-only. Blijkt een veld ongewenst, dan zet een correctiemigratie de
-- kolom op NULL (→ kernel-default) en verwijdert een latere migratie de kolom pas nadat
-- geen route 'm meer leest. Zichtbaar misgaan: een projectie die na de release
-- verschuift zonder dat de gebruiker iets koos — dat kan hier per constructie niet,
-- want NULL is de default.

-- ── P!B54: niet-liquide bezit meetellen in de nalatenschap ────────────────────────
alter table public.profiles
  add column if not exists fire_legacy_include_illiquid boolean;

comment on column public.profiles.fire_legacy_include_illiquid is
  'TPR-12 (horizon-kernel P!B54) — telt niet-liquide bezit (eigen woning e.d.) mee in de '
  'toets of het nalatenschapsbedrag op de eindleeftijd gehaald wordt? true = de kern toetst '
  'op het totale netto vermogen (Prognose!I), false/NULL = alleen op het liquide vermogen '
  '(Prognose!J) — de bestaande kernel-default ''Nee''. Alleen betekenisvol bij eind-vorm '
  '''legacy''. Geschreven via PUT /api/fire-settings; geconsumeerd door '
  'lib/horizon-kernel/adapter/params.ts#buildEindstrategie.';

-- ── P!B91: heffingvrij inkomen (Box 3, tak "werkelijk rendement") ─────────────────
alter table public.profiles
  add column if not exists box3_heffingvrij_inkomen numeric;

-- Idempotent: ADD CONSTRAINT kent geen IF NOT EXISTS. Band = PARAMETER_BANDS
-- .box3_heffingvrij_inkomen in lib/parameters-band.ts (0..100000, euro per persoon
-- per jaar) — wijzigt de band daar, dan hoort hier een nieuwe migratie bij.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_box3_heffingvrij_inkomen_range'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_box3_heffingvrij_inkomen_range
      check (
        box3_heffingvrij_inkomen is null
        or (box3_heffingvrij_inkomen >= 0 and box3_heffingvrij_inkomen <= 100000)
      );
  end if;
end $$;

comment on column public.profiles.box3_heffingvrij_inkomen is
  'TPR-12 (horizon-kernel P!B91) — heffingvrij inkomen in EURO PER PERSOON PER JAAR voor de '
  'Box 3-tak ''werkelijk rendement'' (Bel!M = tarief × MAX(0, werkelijk maandrendement − '
  'heffingvrij/12)); de kern schaalt × personen tot P!B92. NULL = adapter gebruikt de '
  'Excel-default 1800. Geen effect onder box3_method = ''forfaitair''. CHECK 0..100000 = '
  'PARAMETER_BANDS. Geschreven via PUT /api/parameters; geconsumeerd door '
  'lib/horizon-kernel/adapter/params.ts#buildBox3.';

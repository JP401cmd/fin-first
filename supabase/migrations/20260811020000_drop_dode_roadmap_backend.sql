-- Opruimen van de dode roadmap-backend — DEEL 1 van 2 (DDL).
-- Deel 2 (20260811020500) verwijdert de app_settings-sleutel. Bewust gescheiden: een
-- mislukte datacorrectie mag het schema niet meeslepen.
--
-- WAT HIER WEG GAAT
--   * tabel public.roadmap_features (incl. 3 RLS-policies, 2 indexen, 1 trigger)
--   * functie public.update_roadmap_features_updated_at()
--
-- WAAROM — dit is de backend van een roadmap-pagina die in juni 2026 al is verwijderd.
-- De losse `/beheer/roadmap`-pagina die op 8 aug 2026 sneuvelde (besluit 02) was puur
-- statisch (lib/roadmap-functionaliteiten.ts) en raakte deze tabel niet; vandaar dat dit
-- restant bleef staan. De route app/api/roadmap/route.ts is in dezelfde wijziging als
-- deze migratie verwijderd.
--
-- BEWIJS DAT DE TABEL DOOD IS — gemeten READ-ONLY tegen de live database, 11-08-2026
-- (tegen pg_stat_user_tables / pg_constraint / pg_policies / information_schema, niet
-- tegen de migratiebestanden — de repo beschrijft de bedoeling, ADR 0045):
--
--   rijen (count(*))            0
--   n_live_tup / n_dead_tup     0 / 0
--   n_tup_ins                   0   <- er is NOOIT één rij ingevoegd
--   n_tup_upd / n_tup_del       0 / 0
--   last_seq_scan               2026-07-19   (3 weken geleden)
--   last_idx_scan               2026-04-11   (4 maanden geleden)
--   foreign keys ERNAARTOE      geen
--   views die 'm gebruiken      geen
--   functies die 'm noemen      alleen de eigen updated_at-trigger
--
-- Dat n_tup_ins 0 is, is het sterkste argument: deze tabel heeft in haar hele bestaan
-- geen enkele rij gedragen. Een DROP TABLE vernietigt hier dus aantoonbaar niets.
--
-- WAAROM GEEN DEPRECATIE-RONDE (hernoemen nu, droppen later)
-- Die stap bestaat om data te beschermen tegen een verkeerde dood-inschatting. Bij een
-- tabel die nul rijen heeft gehad, beschermt hij niets en levert hij alleen een tweede
-- migratie plus een `_deprecated`-naam op die iemand over een half jaar weer moet
-- opruimen. Daarom in één keer weg. Zou de tabel wél rijen hebben gehad, dan was de
-- volgorde omgekeerd geweest.
--
-- SAMENHANG MET DE ONGEDRAAIDE MIGRATIE 20260810220000 — LEES DIT VÓÓR HET TOEPASSEN.
-- 20260810220000_rls_initplan_wrap_helpers_buiten_transactions.sql is geschreven maar nog
-- NIET toegepast. Die migratie wikkelt o.a. de twee policies
-- "Superadmins can insert/update roadmap features" op DEZE tabel, en sluit af met een
-- zelfcontrole die eist dat er exact 34 helper-dragende policies bestaan. Deze drop haalt
-- er twee weg.
--   => Volgorde is dwingend: EERST 20260810220000, DAARNA deze migratie.
-- De tijdstempels borgen dat (11-08 > 10-08) en elke standaard migratierunner draait op
-- volgorde. Draait het tóch omgekeerd, dan faalt 20260810220000 luid en zonder schade
-- ("policy ... is verdwenen") — een veilige faalstand, geen stille corruptie.

-- ── Slot op de deur: nooit droppen als er tóch data in blijkt te zitten ───────────
--
-- De meting hierboven is van 11-08-2026. Tussen schrijven en toepassen zit de
-- release-stap, en in die tijd kan iemand de tabel alsnog vullen. Deze controle maakt
-- de aanname hard op het moment van uitvoeren in plaats van op het moment van schrijven.
do $$
declare
  aantal bigint;
begin
  if to_regclass('public.roadmap_features') is null then
    raise notice 'roadmap_features bestaat hier niet (meer) — niets te droppen.';
    return;
  end if;

  execute 'select count(*) from public.roadmap_features' into aantal;

  if aantal > 0 then
    raise exception
      'Drop afgebroken: roadmap_features bevat % rij(en), terwijl de analyse (11-08-2026) 0 rijen en 0 inserts ooit vaststelde. '
      'Er is dus alsnog een schrijver. Onderzoek dat eerst — deze migratie gooit anders data weg.', aantal;
  end if;

  raise notice 'roadmap_features is leeg (0 rijen) — drop is veilig.';
end;
$$;

-- ── De drop ───────────────────────────────────────────────────────────────────────
--
-- `drop table` neemt de 3 RLS-policies, de 2 indexen (pkey + feature_nr/fase-unique),
-- de 2 CHECK-constraints en de trigger roadmap_features_updated_at automatisch mee.
-- Bewust GEEN `cascade`: er wijst niets naar deze tabel (geverifieerd, zie boven), dus
-- een gewone drop hoort te slagen. Zou er tóch iets aan hangen, dan faalt de migratie —
-- en dat is precies wat je wilt weten in plaats van stilzwijgend meeslepen.
drop table if exists public.roadmap_features;

-- De trigger verdwijnt met de tabel, de FUNCTIE niet. Die bestaat uitsluitend voor deze
-- tabel: geverifieerd tegen pg_trigger (11-08-2026) hing er precies één trigger aan,
-- namelijk roadmap_features_updated_at op roadmap_features. Zonder deze regel blijft er
-- een weesfunctie achter.
drop function if exists public.update_roadmap_features_updated_at();

-- ── De terugweg ───────────────────────────────────────────────────────────────────
--
-- Migraties zijn append-only; herstellen doe je vooruit met een nieuwe migratie. De
-- volledige oorspronkelijke definitie staat in
-- supabase/migrations/20260319000004_create_roadmap_features.sql (tabel + trigger +
-- policies) en 20260325000001_extend_roadmap_fase_for_production.sql (fase-CHECK met 'p').
-- Herstellen = die twee bestanden opnieuw uitvoeren in een nieuwe migratie, plus
-- 20260611130000_harden_app_settings_roadmap_rpc.sql voor de superadmin-policies.
-- Er gaat geen data verloren die teruggezet moet worden — de tabel was leeg.
--
-- WAARAAN ZIE JE DAT HET MISGING: een 500 op een oppervlak dat alsnog roadmap_features
-- blijkt te lezen. Dat zou een consument zijn die noch in de repo-grep, noch in
-- error_logs, noch in de tabelstatistieken zichtbaar was — zeer onwaarschijnlijk, maar
-- het is het signaal om op te letten.

-- ── job_runs: 'partial' als derde uitkomst ──────────────────────────────────
--
-- AANLEIDING (25 sep 2026). Het Anthropic-tegoed liep op 24 sep ~18:00 leeg. De
-- news-ingest van 25 sep 07:23 landde als `status: 'success'` met `error: null`,
-- terwijl de duidingsstap 0 van 2 rijen duidde en de hele bronklasse
-- `web_lijst` van 33 naar 0 kandidaten viel. De AI-stappen zijn bewust
-- NIET-FATAAL (zonder model draait de ingest door) — goed — maar het
-- resultaatverlies werd niet gemeld. De eigenaar ontdekte het door de app te
-- openen.
--
-- `bank_sync_log` leerde deze les al: daar bestaat 'partial' sinds
-- app/api/bank-connect/sync/route.ts ("een stil weggevallen batch die als
-- status:'success' landde was restrisico 7"). `job_runs` krijgt nu dezelfde
-- derde waarde, zodat een run die liep maar niet alles opleverde te
-- onderscheiden is van een run die wél alles deed.
--
-- WAT DIT NIET DOET: 'partial' vuurt géén actieve melding. Dat is bewust en
-- consistent met de doc-comment van `recordJobRun` (alleen status='error'
-- alarmeert -> geen dagelijkse ruis). De zichtbaarheid zit op /beheer/jobs.
--
-- VOLGORDE (hard): deze migratie MOET vóór de deploy van de bijbehorende code
-- toegepast zijn. Zonder verbrede CHECK faalt elke 'partial'-insert, en
-- `recordJobRun` slikt schrijffouten stil in (logging mag een cron nooit laten
-- falen) — je verliest dan juist de regel in het geval dat je wilde vangen.
--
-- Eigenaarschap en RLS ONGEWIJZIGD: `job_runs` is een platformtabel; inserts
-- gaan via de service-role-client van de crons, superadmins lezen via de
-- bestaande policy "job_runs superadmin select". Geen nieuwe kolom, geen nieuwe
-- index, geen unieke index — dus ook geen `onConflict` die mee moet.
--
-- Herhaalbaar: drop-then-add op de constraint-naam; een tweede run geeft geen
-- 42710. Bestaande rijen ('success'/'error') blijven geldig, dus de nieuwe
-- CHECK valideert zonder fout.
--
-- Terugweg: de oude CHECK terugzetten kan alleen nadat eventuele
-- 'partial'-rijen zijn omgezet (bv. naar 'success'); dat hoort in een aparte,
-- latere migratie. Verruimen is zelf niet destructief — oude code schrijft
-- gewoon 'success'/'error' door.

alter table public.job_runs
  drop constraint if exists job_runs_status_check;

alter table public.job_runs
  add constraint job_runs_status_check
  check (status in ('success', 'partial', 'error'));

comment on column public.job_runs.status is
  'success = alles gelukt · partial = de taak liep, maar een stap verloor zijn resultaat (reden in summary.verlies; geen actieve melding) · error = harde fout (alarmeert).';

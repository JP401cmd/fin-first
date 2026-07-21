-- [Arch F6] Snapshot-provenance (bevinding #27) — leg de PARAMETERSET vast die
-- de afgeleide getallen van een historische snapshot produceerde, zodat "waarom
-- zei de app in april dat mijn FIRE-leeftijd 52 was?" reconstrueerbaar wordt.
--
-- net_worth_snapshots droeg al PARTIELE provenance: engine_bron (welke motor de
-- FIRE-velden schreef, migr. 20260702233200) en score_version (welke health-
-- methode, migr. 20260612000000). Wat ontbrak is de INVOER-parameterset die de
-- afgeleiden (freedom_percentage, fire_age, savings_rate, sovereignty_level,
-- resilience_score) stuurde. Deze kolom dicht dat "toen"-gat.
--
-- WAT ERIN KOMT (compacte waarde-snapshot, ~200 bytes, engine-ONAFHANKELIJK):
--   { v, swr, grossReturn, inflation, box3Drag, taxYear,
--     grondslag:'full-networth', savingsSource:'transactions' }
-- Dit zijn de PARAMETERS/aannames (SWR, rendement, inflatie, Box 3-drag, het
-- belastingjaar dat effectiveSwr stilzwijgend verschuift, en de vermogens-
-- grondslag). De MOTOR die fire_age schreef staat al in engine_bron; de score-
-- methode in score_version — daarom bewust NIET hier gedupliceerd (voorkomt
-- params↔fire_age-drift wanneer de /toekomst-hook fire_age naar de kernel patcht).
-- GEEN PII: uitsluitend numerieke parameters + enum-labels, geen bedragen/namen.
--
-- Nullable & additief: oude rijen blijven NULL = "pre-provenance / onbekend"
-- (niet reconstrueerbaar — dat gat is juist de aanleiding; niet fabriceren). De
-- drie snapshot-schrijfpaden (POST /api/snapshots, .../auto, .../cron) vullen 'm
-- via de gedeelde helper buildSnapshotParams (app/api/snapshots/snapshot-math.ts).
--
-- Geen RLS-wijziging nodig: net_worth_snapshots heeft al een own-row policy
-- ("Users can manage own snapshots", auth.uid() = user_id) plus de gedeelde-
-- huishouden read-policy; een nieuwe kolom valt automatisch onder die row-level
-- policies (identiek aan engine_bron/score_version). Geen index: params wordt
-- niet gefilterd in hot paths (snapshots lezen per user_id/snapshot_date).

alter table public.net_worth_snapshots
  add column if not exists params jsonb;

comment on column public.net_worth_snapshots.params is
  'Parameterset/aannames waarmee de afgeleiden van deze snapshot zijn berekend (v/swr/grossReturn/inflation/box3Drag/taxYear/grondslag/savingsSource). Engine-onafhankelijke provenance; motor staat in engine_bron, score-methode in score_version. NULL = historisch/pre-provenance. Zie [Arch F6] bevinding #27.';

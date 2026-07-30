-- Fase 2 — cross-bron dedup (laag 2): de tellers, gesplitst naar reden.
--
-- `transactions_dup` blijft ONGEWIJZIGD de laag-1-teller (`import_hash`, exacte
-- hash op datum|bedrag|omschrijving). Geen hergebruik, geen betekeniswissel op
-- een bestaande kolom: wie oude rijen leest moet ze morgen nog hetzelfde kunnen
-- lezen als vandaag.
--
-- Waarom TWEE kolommen in plaats van de ene `transactions_dup_cross_source` die
-- het plan aankondigde: de naam-terugval is de zwakke plek van laag 2 (twee
-- filialen van dezelfde keten normaliseren naar dezelfde tegenpartij-naam), en
-- zonder aparte teller is die blinde vlek achteraf niet te meten. Een derde
-- kolom met het totaal is bewust NIET toegevoegd — dat zou een afgeleide waarde
-- naast haar componenten opslaan, en dat is per definitie toekomstige drift.
-- Het totaal is `coalesce(iban,0) + coalesce(name,0)`.
--
-- Additief en nullable, geen default: bestaande rijen én de insert-paden voor
-- `rate_limited` en `error` houden NULL = "niet vastgelegd". Een 0 zou een
-- meting suggereren die er niet was.
alter table public.bank_sync_log
  add column if not exists transactions_dup_cross_source_iban integer,
  add column if not exists transactions_dup_cross_source_name integer;

comment on column public.bank_sync_log.transactions_dup_cross_source_iban is
  'Dedup-laag 2: overgeslagen rijen die op tegenpartij-IBAN als dezelfde boeking zijn herkend (datum ±1 dag, bedrag exact). NULL = niet vastgelegd. Staat los van transactions_dup, dat de laag-1-hashteller blijft.';

comment on column public.bank_sync_log.transactions_dup_cross_source_name is
  'Dedup-laag 2: overgeslagen rijen die via de naam-terugval zijn herkend (één van beide zijden had geen tegenpartij-IBAN). Apart geteld omdat dit de zwakste — en dus te bewaken — grond voor een treffer is.';

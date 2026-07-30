-- Stap 1 van 2 (expand) — `valuations` krijgt een GEBRUIKER-GESCOPETE unieke sleutel.
--
-- Waarom: de bestaande sleutel is `UNIQUE (entity_id, valuation_date)` — zónder
-- `user_id` en zónder `entity_type`. Die conflict-target is daarmee cross-user:
-- botst een `entity_id` tussen twee gebruikers, dan landt de upsert van de een op
-- de rij van de ander en loopt hij op de RLS-check stuk in plaats van te mergen.
-- `balance_snapshots` doet het wél goed (`UNIQUE (user_id, snapshot_date,
-- entity_type, entity_id)`); deze sleutel spiegelt dat.
--
-- Pre-flight op remote (30 juli, vóór toepassen): 39 rijen, 7 gebruikers,
-- 0 groepen die de nieuwe, striktere sleutel zouden schenden, 0
-- (entity_id, valuation_date)-paren met gemengd `entity_type`. De nieuwe sleutel
-- is per constructie een SUPERSET van de oude en dus per definitie zwakker — hij
-- kan niet op bestaande data stuklopen.
--
-- GEEN FK op `entity_id`, en dat is een oordeel, geen vergeten regel:
-- `entity_id` is POLYMORF (`entity_type` bepaalt of het doel `assets` of `debts`
-- is), en PostgreSQL kent geen polymorfe foreign key. Bovendien staat er op
-- remote al 1 `entity_type = 'debt'`-rij zonder bijbehorende `debts`-rij, dus
-- zelfs een gesplitste FK zou op bestaande data falen. De datalaag-variant hoort
-- daarom een guard-trigger te zijn — hetzelfde patroon als het openstaande
-- aandachtspunt over `bank_accounts.linked_asset_id` (ADR 0075), eigen ronde.
--
-- ── Waarom dit stap 1 van 2 is ─────────────────────────────────────────────
-- De oude constraint blijft hier STAAN. `ON CONFLICT` inferreert op een exact
-- passende unieke index, dus code die nog `onConflict: 'entity_id,valuation_date'`
-- stuurt breekt hard op het moment dat die constraint verdwijnt — en dat is niet
-- alleen "tot de deploy": browsers houden een al geladen client-bundel vast, en
-- vier van de negen upsert-plekken zitten in client-componenten (herwaardering,
-- check-in, asset-edit, schuld-edit). Eerst dus de nieuwe sleutel ernaast en de
-- code omzetten; de oude sleutel droppen (stap 2, `contract`) kan pas als de
-- nieuwe bundel live is en er geen oude tabs meer op zitten. Tot dat moment blijft
-- de cross-user-botsing bestaan zoals hij vandaag al bestaat — geen regressie,
-- maar ook nog niet gedicht.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valuations_user_entity_date_key'
      AND conrelid = 'public.valuations'::regclass
  ) THEN
    ALTER TABLE public.valuations
      ADD CONSTRAINT valuations_user_entity_date_key
      UNIQUE (user_id, entity_type, entity_id, valuation_date);
  END IF;
END $$;

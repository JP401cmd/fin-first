-- ── LIFE_EVENTS: harde koppeling naar het verkochte DB-asset ──────────────
--
-- WAAROM
-- Een life event van type 'verkoop' moet voortaan exact kunnen verwijzen naar
-- het asset dat het liquideert, zodat de horizon-rekenmotor het juiste asset uit
-- het grootboek haalt (i.p.v. te raden op naam/type). Tot nu toe was die relatie
-- impliciet; dit maakt 'm expliciet en betrouwbaar.
--
-- TOEGANGSMODEL / RLS
-- life_events is eigenaar-gescoped: RLS-policy "Users can manage own life_events"
-- (FOR ALL USING auth.uid() = user_id) filtert op RIJ-EIGENAAR, niet per kolom.
-- Een nieuwe nullable kolom valt dus automatisch onder dezelfde policy — er is
-- GEEN extra policy nodig. Een gebruiker kan alleen zijn eigen life_events-rijen
-- lezen/schrijven, dus alleen zijn eigen linked_asset_id zetten.
--
-- INTEGRITEIT
-- ON DELETE SET NULL: wordt het gekoppelde asset verwijderd, dan wordt
-- linked_asset_id server-side genuld i.p.v. een zombie-reference achter te laten.
-- Die SET NULL raakt uitsluitend de eigen life_events-rij die naar dat asset wees
-- (en assets zijn óók user-scoped via assets.user_id) — geen cross-user effect,
-- dus geen RLS-lek. Additief, nullable en omkeerbaar (DROP COLUMN).

ALTER TABLE life_events
  ADD COLUMN IF NOT EXISTS linked_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN life_events.linked_asset_id IS
  'Harde koppeling van een verkoop-life-event naar het DB-asset dat het verkoopt; ON DELETE SET NULL';

CREATE INDEX IF NOT EXISTS idx_life_events_user_linked_asset
  ON life_events (user_id, linked_asset_id);

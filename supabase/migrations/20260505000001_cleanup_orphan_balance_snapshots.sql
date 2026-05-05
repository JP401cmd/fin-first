-- Cleanup orphan balance_snapshots rows.
--
-- Achtergrond: `balance_snapshots` heeft geen FK met ON DELETE CASCADE op
-- `entity_id`, omdat de tabel een historische tijdreeks bewaart die
-- losgekoppeld kan zijn van het huidige asset/debt-model. Wanneer een
-- gebruiker echter een asset of debt fysiek verwijdert (niet alleen
-- `is_active=false`) blijven snapshot-rijen achter. Deze "zwerf-snapshots"
-- surfacen sinds de fix in `lib/load-category-history.ts` niet meer in de
-- UI, maar nemen wel ruimte in en kunnen latere debug-acties verwarren.
--
-- Deze migratie verwijdert alleen snapshot-rijen waarvan het bijbehorende
-- asset/debt niet meer bestaat in de live tabel. Bewust geen ON DELETE
-- CASCADE achteraf toevoegen — de tijdreeks blijft een eigen levensvorm
-- waarmee een toekomstige feature (bijv. "geschiedenis van afgesloten
-- bezittingen") nog kan werken zonder schema-wijziging.
--
-- Idempotent: re-runnen doet niets meer zodra er geen orphans zijn.

DELETE FROM public.balance_snapshots
 WHERE entity_type = 'asset'
   AND entity_id NOT IN (SELECT id FROM public.assets);

DELETE FROM public.balance_snapshots
 WHERE entity_type = 'debt'
   AND entity_id NOT IN (SELECT id FROM public.debts);

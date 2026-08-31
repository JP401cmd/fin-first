-- UR2-02 — Ruim de € 0-spookbezittingen op die de onboarding zelf heeft verzonnen.
--
-- ACHTERGROND
-- `POST /api/onboarding/save-own-data` seedde tot aug 2026 een placeholder-
-- bezitting van € 0 zodra de module `budgetteren` of `aandelenregistratie`
-- actief was zonder bijpassend asset-type — óók wanneer de gebruiker de
-- bezittingen-stap expliciet had OVERGESLAGEN. Twee vaste namen, hardcoded in
-- de route:
--   · cash       → 'Lopende rekening'
--   · investment → 'Beleggingsrekening'
-- Gevolg: "Totale waarde € 0 · 2 bezittingen" op /core/assets en een groen
-- afgevinkte welkomst-stap ("Zijn al je bezittingen geregistreerd?", die op
-- `hasAssets` = bestaat-er-een-rij leest) voor iemand die niets had ingevuld.
-- De producent is verwijderd in dezelfde wijziging; deze migratie ruimt de
-- rijen op die er al staan.
--
-- WAAROM DEZE FILTERS ZO STRAK ZIJN
-- 'Lopende rekening' en 'Beleggingsrekening' zijn ook doodgewone namen die een
-- gebruiker zélf kan kiezen — ze staan zelfs in de naam-suggesties
-- (lib/quick-add/name-suggestions.ts). We mogen dus nooit op naam alleen
-- verwijderen. Een geseede rij is herkenbaar aan de VOLLEDIGE vingerafdruk van
-- `buildAssetDraft({ asset_type, name, current_value: 0, field3: null })`:
-- waarde én aankoopwaarde 0, geen instelling, geen inleg, geen notitie — en
-- `updated_at = created_at`, dus door niemand ooit aangeraakt. Wie zelf een
-- rekening van € 0 aanmaakt en er iets aan verandert, valt buiten deze migratie.
--
-- EN WAAROM DE NOT EXISTS-GORDEL
-- Een placeholder kan intussen ergens aan vastzitten: de budgetteren-setup
-- maakt bijvoorbeeld een `bank_accounts`-companion op de gekozen cash-rij, en
-- daarmee is het geen los spook meer maar een rekening waar de gebruiker een
-- keuze op heeft gemaakt. Zulke rijen laten we bewust STAAN (de gebruiker kan
-- ze zelf verwijderen); alleen volledig losstaande spoken gaan weg. Op de
-- productiedatabase van 31 aug 2026 raakt dat 3 van de 4 kandidaten — de
-- vierde heeft een companion en blijft.
--
-- Idempotent: een tweede run vindt niets meer.

DELETE FROM public.assets a
WHERE a.current_value = 0
  AND a.purchase_value = 0
  AND a.monthly_contribution = 0
  AND a.institution IS NULL
  AND a.notes IS NULL
  AND a.updated_at = a.created_at
  AND (
        (a.asset_type = 'cash'       AND a.name = 'Lopende rekening')
     OR (a.asset_type = 'investment' AND a.name = 'Beleggingsrekening')
  )
  -- Nergens aan gekoppeld: alle FK's die naar assets.id wijzen.
  AND NOT EXISTS (SELECT 1 FROM public._legacy_holdings      t WHERE t.asset_id         = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.assets                t WHERE t.linked_asset_id  = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.bank_accounts         t WHERE t.linked_asset_id  = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.broker_connections    t WHERE t.linked_asset_id  = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.crypto_holdings       t WHERE t.asset_id         = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.debts                 t WHERE t.linked_asset_id  = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.exchange_connections  t WHERE t.linked_asset_id  = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.goals                 t WHERE t.linked_asset_id  = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.investment_holdings   t WHERE t.asset_id         = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.life_events           t WHERE t.linked_asset_id  = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.recommendations       t WHERE t.related_asset_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.wallet_addresses      t WHERE t.linked_asset_id  = a.id);

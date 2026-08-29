-- ── Backfill: noodfonds-marker op bestaande doelen ──────────────────
-- Kaart "Noodfonds nakijken canoniek" — testronde 29 jul 2026, bevinding 1
-- (BLOKKEREND), eigenaar-besluit optie (a).
--
-- ⚠️ DEELS ACHTERHAALD (eigenaar-besluit later op 29 jul 2026). De norm voor de
-- noodbuffer is sindsdien ALTIJD 3 × netto maandsalaris; een noodfonds-DOEL
-- stuurt de gezondheidsscore niet meer (zie lib/emergency-fund.ts). Deze
-- migratie is daarmee niet langer nodig om de score te laten kloppen — het
-- "GEVOLG NA TOEPASSEN" hieronder geldt niet meer. Ze blijft wél nuttig en
-- veilig: de marker is hoe /toekomst/doelen hét noodfonds-doel herkent
-- (isEmergencyGoal/pickEmergencyGoal). Draaien mag, hoeft niet.
--
-- PROBLEEM. De canonieke noodfonds-resolver (lib/emergency-fund.ts) detecteert
-- het noodfonds-doel via één stabiele marker: goal_type='emergency_fund' OF
-- goals.metadata.standaardDoel='noodfonds'. Die marker wordt sinds de vorige
-- iteratie alléén bij NIEUW aanmaken weggeschreven (quick-add met preset-tegel +
-- onboarding). Er was geen backfill, dus voor élk bestaand doel viel de resolver
-- terug op source='liquid' met de default van 6 maanden — het door de gebruiker
-- gekozen noodfondsdoel beïnvloedde de gezondheidsscore dus níét. Dat is precies
-- de klacht op de kaart.
--
-- PRODUCTIE-METING VOORAF (29 jul 2026, via execute_sql — relatief weergegeven;
-- exacte tellingen en recordinhoud horen in een rapport buiten git, zie ADR 0111):
--   * GEEN enkel doel had goal_type = 'emergency_fund';
--   * GEEN enkel doel had metadata->>'standaardDoel' gezet — nul markers dus,
--     precies het gat dat deze backfill dicht;
--   * een handvol savings-doelen matcht op naam ~* 'noodfonds', allemaal met
--     metadata = {}.
-- Die naam-treffers zijn verdeeld over evenveel verschillende gebruikers, dus
-- per gebruiker hooguit één treffer (geen ambiguïteit voor pickEmergencyGoal).
--
-- CRITERIUM-KEUZE (bewust NAUW gehouden):
--   * goal_type = 'savings' — de legacy quick-add/onboarding-vorm. Doelen met
--     goal_type='emergency_fund' worden al zonder marker gedetecteerd.
--   * name ~* 'noodfonds' — ondubbelzinnig Nederlands woord voor deze buffer;
--     dekt ALLE gemeten productierijen, inclusief die met een niet-preset icoon
--     ('Target').
--   * GEEN icon = 'ShieldCheck' als extra OR-tak: dat dekt niet alle rijen
--     én is een vrij door de gebruiker te kiezen icoon (een doel "Verzekering"
--     met schild-icoon zou dan onterecht de gezondheidsscore gaan sturen).
--     Naam-match is hier strikt breder én preciezer.
--   * metadata->>'standaardDoel' IS NULL — nooit een bestaande marker
--     overschrijven (bv. 'vakantie'), en maakt de migratie idempotent.
--
-- VEILIGHEID / OMKEERBAARHEID. Geen DDL, geen kolom- of rij-verwijdering: puur
-- een jsonb-MERGE (`||`) die één sleutel TOEVOEGT en alle bestaande sleutels
-- behoudt. Herhaald draaien is een no-op (WHERE-clausule). Terugdraaien kan
-- rij-voor-rij met `metadata = metadata - 'standaardDoel'` op dezelfde selectie.
-- Daarom geen aparte DDL/backfill-splitsing nodig.
--
-- RLS. Migraties draaien als tabel-eigenaar; goals kent own-row RLS
-- (auth.uid() = user_id) die hier niet in de weg zit. De UPDATE is
-- user-agnostisch maar raakt per gebruiker alleen diens eigen rijen — er wordt
-- geen data tussen gebruikers verplaatst of zichtbaar gemaakt.
--
-- GEVOLG NA TOEPASSEN (verwacht, gemeten op de huidige data): voor de getroffen
-- gebruikers wisselt de noodfonds-target van de default 6 maanden naar de
-- maanden-expressie van hun eigen doelbedrag. Dat verhoogt/verlaagt de
-- buffer-pijler van de gezondheidsscore navenant — dat IS de bedoelde werking
-- van optie A (het doel stuurt de TARGET; de teller blijft de liquide pot).

UPDATE goals
SET    metadata = COALESCE(metadata, '{}'::jsonb) || '{"standaardDoel":"noodfonds"}'::jsonb,
       updated_at = now()
WHERE  goal_type = 'savings'
  AND  name ~* 'noodfonds'
  AND  metadata->>'standaardDoel' IS NULL;

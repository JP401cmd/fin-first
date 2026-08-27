-- M23 · Box 3-vrijstelling als overschrijving per bezitting
--
-- AANLEIDING
-- `classifyAsset` (lib/box3-data.ts) leidt de Box 3-indeling af uit asset_type
-- + subtype. Die afleiding is met M23 fiscaal juist gemaakt (roerende zaken
-- voor eigen gebruik eruit, pensioenaanspraken eruit, belastingschuld niet
-- aftrekbaar), maar een afleiding kan de werkelijkheid nooit volledig dekken:
-- kunst kán voor eigen gebruik zijn, een boot kán een belegging zijn, en een
-- polis is vrijgesteld op grond van overgangsrecht dat niet in het datamodel
-- staat. De gebruiker had geen enkel corrigeerpunt op het scherm.
--
-- WAAROM ÉÉN AS EN GEEN BOX-KOLOM
-- Een handmatige "box 1 / box 2 / box 3"-keuze zou bestaande kolommen
-- dupliceren: box 1 volgt al uit asset_type = 'eigen_huis' en uit de
-- pensioen-tak, box 2 uit asset_type = 'deelneming'. Wat ontbrak is precies
-- één as: vrijgesteld ja/nee. Daarom twee kolommen en geen enum.
--
-- SEMANTIEK (drie standen, NULL is er één van)
--   NULL  → geen overschrijving; classifyAsset leidt af uit type + subtype.
--   TRUE  → buiten de Box 3-grondslag, ongeacht de afleiding.
--   FALSE → expliciet BINNEN de Box 3-grondslag, ongeacht de afleiding.
-- NULL is dus nadrukkelijk niet hetzelfde als FALSE. De kolom is bewust
-- nullable zonder default: een DEFAULT false zou elke bestaande rij stilzwijgend
-- op "expliciet niet vrijgesteld" zetten en daarmee de nieuwe, juiste afleiding
-- voor het hele bestand uitschakelen — precies de bug die M23 repareert.
--
-- BACKFILL: GEEN. Alle bestaande rijen houden NULL en volgen dus de afleiding.
--
-- RLS: geen nieuwe policies nodig. Kolommen erven de bestaande, huishoud-
-- gedeelde policies op public.assets (auth.uid() = user_id OR shared+household).
-- Er komt geen nieuwe toegangsweg bij, alleen twee velden op een rij die de
-- lezer al mocht zien.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS box3_vrijgesteld boolean,
  ADD COLUMN IF NOT EXISTS box3_vrijstelling_reden text;

COMMENT ON COLUMN public.assets.box3_vrijgesteld IS
  'Overschrijving op de Box 3-afleiding in lib/box3-data.ts#classifyAsset. NULL = afleiden uit asset_type/subtype (normale stand), TRUE = buiten de Box 3-grondslag, FALSE = expliciet erbinnen.';

COMMENT ON COLUMN public.assets.box3_vrijstelling_reden IS
  'Vrije toelichting van de gebruiker bij box3_vrijgesteld; wordt als uitsluitingsreden getoond op /overzicht/belasting/box3.';

-- Lengtegrens op de vrije tekst: het is een toelichtingsregel op het scherm,
-- geen notitieveld. Voorkomt dat een client onbegrensde tekst in de rij duwt.
ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_box3_vrijstelling_reden_len;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_box3_vrijstelling_reden_len
  CHECK (box3_vrijstelling_reden IS NULL OR char_length(box3_vrijstelling_reden) <= 200);

-- Corrigeer de bevroren Box 3-forfaits in de reeds-geseede prefab-rekenhulpen.
--
-- Achtergrond: 20260530120000_seed_prefab_calculators.sql zette de VOLLEDIGE
-- calculator-definition (uit lib/calculator/prefab-definitions.ts) als bevroren
-- JSONB in custom_calculators. Die snapshot bevatte nog de 2025-forfaits
-- (beleggen 5,88% / sparen 1,44%). De TS-bron is naar de canonieke jaartabel
-- BOX3_PARAMS[2026] getild (beleggen 6,00% / sparen 1,28%), maar dat werkt NIET
-- door naar al-geseede rijen. Deze migratie UPDATet daarom gericht de twee
-- betrokken definitions in-place (geen her-INSERT), idempotent en met een guard
-- op de veld-key zodat een array-volgorde-wijziging nooit stil de verkeerde
-- leaf raakt.
--
-- 1) box3-forfait-vs-werkelijk: inputs[forfait_beleggen].default 0.0588 → 0.06,
--    inputs[forfait_spaar].default 0.0144 → 0.0128.
-- 2) verhuurkamer-regimes: outputs[belasting_jaar].formula box3-tak
--    woz * 0.25 * 0.0588 * 0.36 → woz * 0.25 * 0.06 * 0.36.

UPDATE custom_calculators
SET definition = jsonb_set(
      jsonb_set(definition, '{inputs,3,default}', '0.06'::jsonb, false),
      '{inputs,4,default}', '0.0128'::jsonb, false),
    updated_at = now()
WHERE id = 'ce3612a7-f37e-441f-851a-cfe3b7239bfa'
  AND definition #>> '{inputs,3,key}' = 'forfait_beleggen'
  AND definition #>> '{inputs,4,key}' = 'forfait_spaar';

UPDATE custom_calculators
SET definition = jsonb_set(
      definition,
      '{outputs,0,formula}',
      to_jsonb('if(scenario == "niet_verhuren", 0, if(scenario == "kamervrijstelling", if(jaarhuur <= 6633, 0, boven_vrijstelling * ib_tarief), if(scenario == "box3", woz * 0.25 * 0.06 * 0.36, if(scenario == "box1_row", max(0, jaarhuur * 0.7) * ib_tarief, boven_vrijstelling * ib_tarief * 0.5))))'::text),
      false),
    updated_at = now()
WHERE id = '7b1d6878-4712-497f-88e8-3205eae1dacf'
  AND definition #>> '{outputs,0,key}' = 'belasting_jaar';

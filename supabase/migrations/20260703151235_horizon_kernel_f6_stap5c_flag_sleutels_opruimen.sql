-- FASE 6 stap 5C (horizon-kernel, ADR 0032) — opruimen van de vier tijdelijke
-- cutover-vlag-sleutels uit profiles.feature_preferences. De vlaggen bestonden
-- alleen tijdens de FASE 5-uitrol + korte noodklep-periode; sinds `95bafeb53`
-- is de kernel de enige motor en leest geen code deze sleutels meer.
-- Idempotent; raakt alleen rijen die (minstens) één van de sleutels dragen
-- (op moment van schrijven: 1 rij — het eigenaar-account uit de uitrolperiode).

UPDATE public.profiles
SET feature_preferences = feature_preferences
  - 'horizon_kernel_convergentie'
  - 'horizon_kernel_whatif'
  - 'horizon_kernel_household'
  - 'horizon_kernel_scalar'
WHERE feature_preferences ?| array[
  'horizon_kernel_convergentie',
  'horizon_kernel_whatif',
  'horizon_kernel_household',
  'horizon_kernel_scalar'
];

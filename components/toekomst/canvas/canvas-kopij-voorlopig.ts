/**
 * Voorlopige canvas-kopij (ADR 0179 fase 2, stroom W1).
 *
 * `lib/horizon/katern-copy.ts` is de énige bron voor tekst op /toekomst, maar dat
 * bestand hoort bij stroom W2. Deze drie teksten had het canvas nodig en staan daar
 * nog niet; W2 neemt ze over in `katern-copy.ts`, waarna dit bestand verdwijnt en de
 * imports omgaan. Geen andere tekst hier bijzetten.
 */

/** Titel van de canvas-i — "Zo werkt je grafiek" heeft één ingang (spec §4.9). */
export const CANVAS_UITLEG_TITEL = 'Zo werkt je grafiek'

/**
 * Doelen, in Samenstelling en Geldstroom: die modi tonen het plan tot de adapter het
 * doelscenario levert (spec §4.5, "het enige controlepunt"). Tekst uit de mockup-kopij
 * (`components/beheer/toekomst-katernen-mockup/kopij.ts`, `doelenVolgtPlan`).
 */
export const DOELEN_VOLGT_PLAN_REGEL =
  'Samenstelling en Geldstroom volgen je plan; je doelscenario zie je in Vermogen'

/**
 * De marktcheck-laag staat aan maar de doorrekening mislukte. Vervangt de vervallen
 * `ChartOverlayExplainer`-tekst ("Zet de pil uit en weer aan …"): de pil bestaat niet
 * meer, de laag wel.
 */
export const MARKTCHECK_MISLUKT_REGEL =
  'De marktcheck kon niet worden doorgerekend. Je planlijn klopt gewoon; zet de laag uit en weer aan om het opnieuw te proberen.'

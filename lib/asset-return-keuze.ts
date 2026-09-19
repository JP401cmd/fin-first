// lib/asset-return-keuze.ts
// ---------------------------------------------------------------------------
// "Eigen rendement of profielrendement?" — de KEUZE, één keer geformuleerd.
//
// Sinds migratie 20260919140000 (TPR-02 vervolg, ADR 0166) kan een bezitting
// vastleggen dat ze GEEN eigen rendementsaanname heeft: `expected_return = null`.
// De kern valt dan terug op het profielrendement (`potRendement`).
//
// WAAROM DIT BESTAND BESTAAT — de keuze verschijnt op twee plekken: het
// bezittingenformulier (components/core/assets-client.tsx) en de laag-2-editor
// van de plan-review (components/future/plan-review/laag2-editors.tsx). De
// plan-review-conventie in CLAUDE.md eist één editor-body voor beide hosts en
// optie-kopij als `Record<Union, …>` met keuze · effect · waarom. Twee
// formulieren die hetzelfde veld anders uitleggen is precies hoe een gebruiker
// twee verschillende mentale modellen van één getal krijgt.
//
// DE VALKUIL DIE DEZE MODULE AFDWINGT — "leeg veld" mag NOOIT stil `null`
// worden. Dan wordt elke onvoltooide invoer een profielrendement-aanname van
// bijvoorbeeld 7% op een auto. De keuze is daarom EXPLICIET: `resolveKeuzeWaarde`
// geeft `null` alleen terug wanneer de gebruiker 'profiel' heeft aangevinkt, en
// een leeg getalveld onder 'eigen' blijft een invoerfout — geen stille terugval.
// ---------------------------------------------------------------------------

/**
 * De twee manieren waarop een bezitting aan een rendement komt.
 * - `eigen`   — een door de gebruiker ingevuld percentage (óók een bewuste 0%).
 * - `profiel` — geen eigen aanname; de app rekent met het profielrendement.
 */
export type AssetRendementKeuze = 'eigen' | 'profiel'

export interface AssetRendementKeuzeKopij {
  /** Wat de gebruiker aanvinkt. */
  keuze: string
  /** Wat het met zijn plan doet. */
  effect: string
  /** Waarom dit een keuze is en niet een instelling die wij voor hem maken. */
  waarom: string
}

/**
 * Optie-kopij, als `Record<Union, …>`: een nieuwe optie compileert pas met
 * keuze · effect · waarom erbij (eigenaarsnorm 13 sep 2026, "Formulier-uitleg").
 *
 * De teksten dragen bewust geen percentage: het profielrendement is per
 * gebruiker anders en staat op /toekomst bij de voorkeuren. Een hard getal hier
 * zou op het moment van schrijven kloppen en daarna stil verouderen.
 */
export const ASSET_RENDEMENT_KEUZE_KOPIJ: Record<AssetRendementKeuze, AssetRendementKeuzeKopij> = {
  eigen: {
    keuze: 'Ik vul zelf een rendement in',
    effect: 'De app laat deze bezitting elk jaar met jouw percentage groeien — of dalen, bij een negatief getal.',
    waarom:
      'Je weet vaak beter wat dit specifieke bezit doet dan een gemiddelde. Een spaarrekening met een vaste rente of een auto die afschrijft hoort niet op je beleggingsrendement te groeien. Ook 0% is hier een geldige, bewuste keuze.',
  },
  profiel: {
    keuze: 'Geen eigen rendement — gebruik mijn profielrendement',
    effect:
      'De app rekent voor deze bezitting met het brutorendement uit je voorkeuren. Pas je dat later aan, dan beweegt deze bezitting automatisch mee.',
    waarom:
      'Niet elk bezit verdient een eigen aanname. Dit voorkomt dat je hetzelfde getal op tien plekken bijhoudt — en het is iets anders dan 0% invullen: 0% betekent "dit groeit niet", deze keuze betekent "reken met mijn standaard".',
  },
}

/**
 * Leidt de keuze af uit een opgeslagen waarde. `null` (geen eigen aanname) →
 * 'profiel', elk getal → 'eigen'.
 *
 * Gebruik dit om een formulier te INITIALISEREN, nooit om een opslag-waarde te
 * bepalen; daarvoor is `resolveKeuzeWaarde`.
 */
export function keuzeUitWaarde(expectedReturnPct: number | null | undefined): AssetRendementKeuze {
  return expectedReturnPct == null ? 'profiel' : 'eigen'
}

/**
 * De waarde die naar de database gaat, gegeven de EXPLICIETE keuze van de
 * gebruiker en het ingevulde getal.
 *
 * - `profiel` → `null`, ongeacht wat er in het getalveld staat. De gebruiker
 *   heeft de keuze gemaakt; een achtergebleven getal mag die niet overrulen.
 * - `eigen` → het getal. Is dat niet leesbaar (`null`), dan geeft deze functie
 *   `null` terug als SIGNAAL VOOR DE AANROEPER dat er niets op te slaan valt —
 *   de aanroeper hoort dat als invoerfout te behandelen en NIET als "geen eigen
 *   rendement". Toets daarom altijd eerst je veldvalidatie; deze functie is de
 *   laatste vertaalslag, niet de poort.
 */
export function resolveKeuzeWaarde(keuze: AssetRendementKeuze, ingevuldPct: number | null): number | null {
  return keuze === 'profiel' ? null : ingevuldPct
}

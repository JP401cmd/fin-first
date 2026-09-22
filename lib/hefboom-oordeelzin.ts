/**
 * De kop van een hefboompagina als één lopende zin (ADR 0174 D6, F3 van
 * "Topbar & oordeelzin").
 *
 * Sinds F1 staat de paginanaam op mobiel links in de TopBar ("‹ Bezittingen").
 * De kop op de pagina hoeft de naam dus niet meer los te dragen en wordt één zin
 * met de naam als onderwerp: "Je bezittingen zijn *goed gespreid*." Het
 * cursieve deel draagt de stoplichtkleur. Zo leest een beginner het oordeel als
 * een uitspraak over zijn eigen situatie, en niet als een label achter een
 * streep ("Bezittingen | Goed gespreid", melding B-071).
 *
 * ── Waarom naast `HEFBOOM_VERDICT` en niet in plaats daarvan ─────────────
 * `HEFBOOM_VERDICT` (lib/hefboom-status-copy.ts) voedt óók de hefboomtegels op
 * /overzicht en de rondleiding. Daar staat het oordeel als label onder een
 * tegelnaam, en een hele zin past daar niet. Deze module levert alleen de
 * paginakop. De STATUS komt voor beide uit dezelfde bron
 * (`loadHefboomPageVerdict` → `loadLeverScores`); alleen de zin verschilt.
 *
 * ── De vorm ──────────────────────────────────────────────────────────────
 * Elke zin begint met een vast onderwerp per hefboom (`HEFBOOM_ONDERWERP`).
 * Dat is geen stijlkeuze maar een streamingcontract: op /overzicht/budget
 * staat het onderwerp ("Je budget") al in de eerste byte, en de rest van de zin
 * stroomt er achteraan. De kop groeit dan tot een zin in plaats van te
 * verspringen. `hefboom-oordeelzin.test.ts` pint dat elke `voor` met het
 * onderwerp begint.
 *
 * ── Wft en ADR 0165 ──────────────────────────────────────────────────────
 * Elke zin is een CONSTATERING over de eigen situatie: geen imperatief, geen
 * bedrag- of besparingsbelofte en geen koop-/verkoopmetafoor. De belasting-
 * regel houdt de hedge "mogelijk", net als `HEFBOOM_VERDICT.belasting.warn`.
 *
 * Pure module (géén 'use client'), zodat server-pages en client-components
 * dezelfde zin lezen.
 */

import type { Hefboom } from './hefboom-config'
import type { LeverageStatus } from './leverage-status'

/**
 * Een kop als zin: `{voor} <em>{oordeel}</em>{na}.` De punt zet de component.
 *
 * Dezelfde vorm gebruikt /toekomst (`resolvePlanVerdictSentence` in
 * lib/horizon/plan-status.ts), ook al is dat geen hefboom.
 */
export interface Oordeelzin {
  /** Het begin van de zin, mét onderwerp: "Je bezittingen zijn". */
  voor: string
  /** Het cursieve deel in stoplichtkleur: "goed gespreid". */
  oordeel: string
  /** Wat er na het oordeel nog komt, zonder punt: "zien". Meestal leeg. */
  na?: string
}

/**
 * Het vaste onderwerp per hefboom — draagt het paginawoord. Bij de cashflow-
 * hefboom is dat "budget", want die hefboom heet in de app Budget
 * (/overzicht/budget, ADR 0135).
 *
 * Belasting zegt "Je Box 3-belasting" en niet "Je belasting": de status van die
 * hefboom is uitsluitend `box3TaxStatus` (lib/lever-scores.ts). De hub toont ook
 * Box 1, vaak het grootste bedrag. "Je belasting blijft *beperkt*." zou daar een
 * uitspraak over álle belasting zijn die de score niet meet (eindreview F3).
 */
export const HEFBOOM_ONDERWERP: Record<Hefboom, string> = {
  bezittingen: 'Je bezittingen',
  schulden: 'Je schulden',
  cashflow: 'Je budget',
  belasting: 'Je Box 3-belasting',
}

/**
 * De kop per hefboom × status. Anders dan `HEFBOOM_VERDICT` staat `neutral`
 * er wél in: een kop moet altijd iets zeggen, en "nog niet in beeld" is een
 * toestand die een beginner zelf kan oplossen.
 *
 * Budget zegt bij `neutral` "nog niet te beoordelen" en niet "nog niet in
 * beeld": die pagina toont altijd een cijferblok, dus de gegevens zijn er wél,
 * alleen de lever-score nog niet (zelfde onderscheid als
 * `HEFBOOM_VERDICT_NEUTRAL_MET_CIJFER`, UR3-17 #8).
 *
 * Schulden zegt bij `good` "wegen licht" en níet "worden op schema afgelost"
 * (het concept, en `HEFBOOM_VERDICT.schulden.good`): de score is de verhouding
 * schuld/bezit (`scoreDebtRatio`), geen aflosschema. Wie schuldenvrij is maar
 * wel vermogen heeft, staat op groen — en had anders gelezen dat schulden die
 * hij niet heeft "op schema" worden afgelost (eindreview F3).
 */
export const HEFBOOM_OORDEELZIN: Record<Hefboom, Record<LeverageStatus, Oordeelzin>> = {
  bezittingen: {
    good: { voor: 'Je bezittingen zijn', oordeel: 'goed gespreid' },
    warn: { voor: 'Je bezittingen zijn', oordeel: 'beperkt gespreid' },
    bad: { voor: 'Je bezittingen zijn', oordeel: 'sterk geconcentreerd' },
    neutral: { voor: 'Je bezittingen zijn', oordeel: 'nog niet in beeld' },
  },
  schulden: {
    good: { voor: 'Je schulden', oordeel: 'wegen licht' },
    warn: { voor: 'Je schulden', oordeel: 'vragen aandacht' },
    bad: { voor: 'Je schulden', oordeel: 'wegen zwaar' },
    neutral: { voor: 'Je schulden zijn', oordeel: 'nog niet in beeld' },
  },
  cashflow: {
    good: { voor: 'Je budget is', oordeel: 'op koers met sparen' },
    warn: { voor: 'Je budget blijft', oordeel: 'onder je spaardoel' },
    bad: { voor: 'Je budget laat', oordeel: 'een tekort', na: 'zien' },
    neutral: { voor: 'Je budget is', oordeel: 'nog niet te beoordelen' },
  },
  // `good` dekt ook "beperkt boven de vrijstelling mét fiscaal partner"
  // (box3TaxStatus), vandaar "beperkt" en niet "nul" — zie HEFBOOM_VERDICT.
  belasting: {
    good: { voor: 'Je Box 3-belasting blijft', oordeel: 'beperkt' },
    warn: { voor: 'Je Box 3-belasting is', oordeel: 'mogelijk hoger dan nodig' },
    bad: { voor: 'Je Box 3-belasting is', oordeel: 'hoog' },
    neutral: { voor: 'Je Box 3-belasting is', oordeel: 'nog niet in beeld' },
  },
}

/** De kop-zin van één hefboom bij een gegeven status. */
export function hefboomOordeelzin(key: Hefboom, status: LeverageStatus): Oordeelzin {
  return HEFBOOM_OORDEELZIN[key][status]
}

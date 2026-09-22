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
 * bedrag- of besparingsbelofte en geen koop-/verkoopmetafoor. De belasting-regel
 * droeg tot ADR 0177 de hedge "mogelijk"; die is vervallen omdat de bron de
 * openstaande posten nu daadwerkelijk telt in plaats van ze te vermoeden (zie
 * `HEFBOOM_VERDICT.belasting`). Het BEDRAG blijft buiten de kop — dat staat in
 * de status-duiding-melding.
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
 * Belasting is de ENIGE hefboom waarvan het onderwerp niet het paginawoord
 * draagt, en dat is sinds ADR 0177 een bewuste keuze. Het onderwerp was "Je Box
 * 3-belasting" omdat de status uitsluitend `box3TaxStatus` was — de hoogte van
 * de Box 3-heffing — terwijl de hub ook Box 1 toont. Die grondslag is vervallen:
 * de hefboom meet nu de ONBENUTTE FISCALE RUIMTE als aandeel van de eigen
 * heffing over Box 1 én Box 3 (`computeFiscaleRuimte`). "Je Box 3-belasting"
 * zou dus te smal zijn (Box 1 telt mee) en "Je belasting" te breed én onjuist
 * (de zin gaat niet over de hoogte van de heffing, maar over wat je ernaast laat
 * liggen). Het onderwerp is daarom de grondslag zelf: "Je fiscale ruimte". Het
 * paginawoord staat er nog steeds bij — de TopBar draagt "Belasting" links van
 * de kop.
 */
export const HEFBOOM_ONDERWERP: Record<Hefboom, string> = {
  bezittingen: 'Je bezittingen',
  schulden: 'Je schulden',
  cashflow: 'Je budget',
  belasting: 'Je fiscale ruimte',
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
 * (het concept): de score is de verhouding schuld/bezit (`scoreDebtRatio`),
 * geen aflosschema. Wie schuldenvrij is maar wel vermogen heeft, staat op groen
 * — en had anders gelezen dat schulden die hij niet heeft "op schema" worden
 * afgelost (eindreview F3). De tegel zegt sinds 22 sep "Lage schuldenlast".
 *
 * Budget noemt bij good/warn/bad geen oorzaak ("op koers", "vraagt aandacht",
 * "staat onder druk"). Het concept zei "op koers met sparen · onder je
 * spaardoel · laat een tekort zien", maar de cashflow-status mengt spaarquote
 * en budgetoverschrijding 50/50 (`computeLeverScores`): alleen budgetten met
 * drie overschrijdingen is rood zonder gemeten tekort, 0% sparen met alle
 * budgetten binnen de limiet is groen. De deck eronder noemt beide oorzaken
 * ("We kijken hoeveel je spaart en of je binnen je budgetten blijft").
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
    good: { voor: 'Je budget is', oordeel: 'op koers' },
    warn: { voor: 'Je budget', oordeel: 'vraagt aandacht' },
    bad: { voor: 'Je budget staat', oordeel: 'onder druk' },
    neutral: { voor: 'Je budget is', oordeel: 'nog niet te beoordelen' },
  },
  // ADR 0177: de zin gaat over onbenutte fiscale ruimte, niet over de hoogte van
  // de heffing. `good` zegt "goed benut" en niet "volledig benut" — de groene
  // band loopt tot 5% van de eigen heffing, dus er mág een kleine post
  // openstaan. `warn` en `bad` verschillen in graad ("deels" / "grotendeels"),
  // precies zoals de banden dat doen; de MELDING eronder noemt de post en het
  // bedrag (PAGE_STATUS_COPY['/overzicht/belasting'].byCause).
  //
  // Geen hedge "mogelijk" meer: de posten worden geteld, niet vermoed — zie de
  // aantekening bij HEFBOOM_VERDICT.belasting.
  belasting: {
    good: { voor: 'Je fiscale ruimte is', oordeel: 'goed benut' },
    warn: { voor: 'Je fiscale ruimte is', oordeel: 'deels onbenut' },
    bad: { voor: 'Je fiscale ruimte is', oordeel: 'grotendeels onbenut' },
    neutral: { voor: 'Je fiscale ruimte is', oordeel: 'nog niet in beeld' },
  },
}

/** De kop-zin van één hefboom bij een gegeven status. */
export function hefboomOordeelzin(key: Hefboom, status: LeverageStatus): Oordeelzin {
  return HEFBOOM_OORDEELZIN[key][status]
}

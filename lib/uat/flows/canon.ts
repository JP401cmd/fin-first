// Gecureerde CANON-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: het canonieke register (lib/uat/canonical-registry.ts) + de acceptatie in
// lib/uat/acceptance/canon.ts. De knopen met `scenarioId` verwijzen naar de
// UAT-scenario-ID's uit lib/uat/catalog.ts (UAT-CANON-NN) en erven daarmee de
// rondestatus.
//
// CANON leest als het SSoT-fan-out-verhaal, per kerngetal (niet per workflow zoals
// KRUIS): uit het CANONIEKE REGISTER (stage 0) loopt PER KERNGETAL één bron→consument-
// toets (stage 1) naar de DOMEINEN die het getal consumeren (stage 2, cross) en
// vervolgens naar het META-scenario "register compleet & uitputtend" (stage 3) tot
// de uitkomst (stage 4): elk getal één bron, overal identiek.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const CANON_FLOW: UatFlow = {
  zone: 'CANON',
  nodes: [
    // ── 0 · instap: het canonieke register (single source per kerngetal) ────
    { id: 'register', label: 'Canoniek register — één bron per kerngetal', kind: 'entry', stage: 0 },

    // ── 1 · bron → consument-toetsen, per kerngetal ────────────────────────
    { id: 'c01', scenarioId: 'UAT-CANON-01', label: 'WF-CANON-01 · Netto vermogen (inclusie-gewogen loader)', kind: 'screen', stage: 1, lane: 'vermogen' },
    { id: 'c04', scenarioId: 'UAT-CANON-04', label: 'WF-CANON-04 · FIRE-eligible grondslag (getFireEligibleNetWorth)', kind: 'screen', stage: 1, lane: 'vermogen' },
    { id: 'c02', scenarioId: 'UAT-CANON-02', label: 'WF-CANON-02 · Spaarquote (savingsRateFromAggregates)', kind: 'screen', stage: 1, lane: 'stromen' },
    { id: 'c06', scenarioId: 'UAT-CANON-06', label: 'WF-CANON-06 · Dagtarief €→tijd (dailyExpenseRate)', kind: 'screen', stage: 1, lane: 'stromen' },
    { id: 'c03', scenarioId: 'UAT-CANON-03', label: 'WF-CANON-03 · Vrijheids-% (computeFreedomProgress)', kind: 'screen', stage: 1, lane: 'vrijheid' },
    { id: 'c05', scenarioId: 'UAT-CANON-05', label: 'WF-CANON-05 · Effectieve SWR (computeEffectiveSwr)', kind: 'screen', stage: 1, lane: 'vrijheid' },
    { id: 'c08', scenarioId: 'UAT-CANON-08', label: 'WF-CANON-08 · FIRE-datum/-leeftijd (horizon-kernel, oracle)', kind: 'screen', stage: 1, lane: 'vrijheid' },
    { id: 'c09', scenarioId: 'UAT-CANON-09', label: 'WF-CANON-09 · Box 3-heffing (calculateBox3)', kind: 'screen', stage: 1, lane: 'belasting' },
    { id: 'c10', scenarioId: 'UAT-CANON-10', label: 'WF-CANON-10 · Jaarruimte-besparing (jaarruimteBesparing)', kind: 'screen', stage: 1, lane: 'belasting' },
    { id: 'c13', scenarioId: 'UAT-CANON-13', label: 'WF-CANON-13 · Fiscale constanten per jaar (BOX1/2/3/VPB_PARAMS)', kind: 'screen', stage: 1, lane: 'belasting' },
    { id: 'c07', scenarioId: 'UAT-CANON-07', label: 'WF-CANON-07 · Gezondheidsgetal (buildHealthScoreInput)', kind: 'screen', stage: 1, lane: 'status' },
    { id: 'c11', scenarioId: 'UAT-CANON-11', label: 'WF-CANON-11 · Noodfonds (resolveEmergencyFund)', kind: 'screen', stage: 1, lane: 'status' },
    { id: 'c12', scenarioId: 'UAT-CANON-12', label: 'WF-CANON-12 · Hefboom-status (leverage-status)', kind: 'screen', stage: 1, lane: 'status' },

    // ── 1 · fundament-vangrail (maandgrenzen onder de getallen) ────────────
    { id: 'c14', scenarioId: 'UAT-CANON-14', label: 'WF-CANON-14 · Fundament: localMonthBounds (maandvenster)', kind: 'screen', stage: 1, lane: 'fundament' },

    // ── 2 · domeinen die de kerngetallen consumeren (cross) ────────────────
    { id: 'x-ovz', label: 'Overzicht-hub', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'OVZ' },
    { id: 'x-bezit', label: 'Bezittingen', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'BEZIT' },
    { id: 'x-schuld', label: 'Schulden & hypotheek', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'SCHULD' },
    { id: 'x-cash', label: 'Cashflow & import', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'CASH' },
    { id: 'x-belast', label: 'Belasting (Box 1/2/3)', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'BELAST' },
    { id: 'x-toek', label: 'Toekomst & tijdas', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'TOEK' },
    { id: 'x-rapp', label: 'Rapportages', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'RAPP' },
    { id: 'x-will', label: 'Fin (AI) noemt dezelfde getallen', kind: 'cross', stage: 2, lane: 'domein', crossZone: 'WILL' },

    // ── 3 · meta-scenario: register compleet & uitputtend ──────────────────
    { id: 'c15', scenarioId: 'UAT-CANON-15', label: 'WF-CANON-15 · Register compleet & uitputtend (elk getal één bron)', kind: 'screen', stage: 3, lane: 'meta' },

    // ── 4 · uitkomst ───────────────────────────────────────────────────────
    { id: 'canoniek', label: 'Elk kerngetal één canonieke bron, overal identiek (nooit oppervlak-eigen herberekend)', kind: 'outcome', stage: 4 },
  ],
  edges: [
    // register → elk kerngetal + fundament
    { from: 'register', to: 'c01' },
    { from: 'register', to: 'c02' },
    { from: 'register', to: 'c03' },
    { from: 'register', to: 'c04' },
    { from: 'register', to: 'c05' },
    { from: 'register', to: 'c06' },
    { from: 'register', to: 'c07' },
    { from: 'register', to: 'c08' },
    { from: 'register', to: 'c09' },
    { from: 'register', to: 'c10' },
    { from: 'register', to: 'c11' },
    { from: 'register', to: 'c12' },
    { from: 'register', to: 'c13' },
    { from: 'register', to: 'c14' },
    { from: 'register', to: 'c15' },

    // kerngetal → consumerende domeinen (cross)
    { from: 'c01', to: 'x-ovz', kind: 'cross' },
    { from: 'c01', to: 'x-bezit', kind: 'cross' },
    { from: 'c01', to: 'x-schuld', kind: 'cross' },
    { from: 'c01', to: 'x-rapp', kind: 'cross' },
    { from: 'c01', to: 'x-will', kind: 'cross' },
    { from: 'c02', to: 'x-cash', kind: 'cross' },
    { from: 'c02', to: 'x-will', kind: 'cross' },
    { from: 'c03', to: 'x-ovz', kind: 'cross' },
    { from: 'c04', to: 'x-toek', kind: 'cross' },
    { from: 'c05', to: 'x-toek', kind: 'cross' },
    { from: 'c06', to: 'x-belast', kind: 'cross' },
    { from: 'c07', to: 'x-ovz', kind: 'cross' },
    { from: 'c08', to: 'x-toek', kind: 'cross' },
    { from: 'c09', to: 'x-belast', kind: 'cross' },
    { from: 'c10', to: 'x-belast', kind: 'cross' },
    { from: 'c11', to: 'x-ovz', kind: 'cross' },
    { from: 'c12', to: 'x-ovz', kind: 'cross' },
    { from: 'c13', to: 'x-belast', kind: 'cross' },

    // fundament schraagt de maand-gebonden getallen
    { from: 'c14', to: 'c02', kind: 'branch', label: 'maandvenster' },
    { from: 'c14', to: 'c06', kind: 'branch', label: 'maandvenster' },

    // alle kerngetallen vloeien samen in het meta-scenario
    { from: 'c01', to: 'c15' },
    { from: 'c02', to: 'c15' },
    { from: 'c03', to: 'c15' },
    { from: 'c04', to: 'c15' },
    { from: 'c05', to: 'c15' },
    { from: 'c06', to: 'c15' },
    { from: 'c07', to: 'c15' },
    { from: 'c08', to: 'c15' },
    { from: 'c09', to: 'c15' },
    { from: 'c10', to: 'c15' },
    { from: 'c11', to: 'c15' },
    { from: 'c12', to: 'c15' },
    { from: 'c13', to: 'c15' },
    { from: 'c14', to: 'c15' },

    // meta → uitkomst
    { from: 'c15', to: 'canoniek' },
  ],
}

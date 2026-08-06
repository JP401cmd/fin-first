// Gecureerde Bezit-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Bezittingen & beleggingen (WF-BEZIT)"
// (WF-BEZIT-01..24) en de POC-bouwspec. De knopen met `scenarioId` verwijzen
// naar de UAT-scenario-ID's uit lib/uat/catalog.ts (UAT-BEZIT-NN) en erven
// daarmee de rondestatus. Het label toont bewust het WF-nummer.
//
// Afbakening: WF-BEZIT-19 (broker-koppeling) en WF-BEZIT-20 (exchange-/wallet-
// koppeling) hebben GEEN eigen UAT-scenario — ze zijn per uat-plan.md §1.4
// gedekt door UAT-MIJN-18 (doorwerking getoetst in UAT-BEZIT-12/21). Ze staan
// hier daarom als cross-knoop naar de zone MIJN (statusloos), net zoals de
// hypotheek-koppeling een cross-knoop naar SCHULD is.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const BEZIT_FLOW: UatFlow = {
  zone: 'BEZIT',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar Bezittingen (/overzicht/bezittingen)', kind: 'entry', stage: 0 },
    { id: 'leeg', label: 'Al bezittingen?', kind: 'decision', stage: 0 },

    // ── 1 · hub ───────────────────────────────────────────────────────────
    { id: 'ovz', scenarioId: 'UAT-BEZIT-01', label: 'WF-BEZIT-01 · Bezittingenoverzicht', kind: 'screen', stage: 1 },

    // ── 2 · verkennen ─────────────────────────────────────────────────────
    { id: 'filter', scenarioId: 'UAT-BEZIT-02', label: 'WF-BEZIT-02 · Filteren op categorie', kind: 'screen', stage: 2, lane: 'verkennen' },
    { id: 'verdeling', scenarioId: 'UAT-BEZIT-03', label: 'WF-BEZIT-03 · Verdeling & projectie', kind: 'screen', stage: 2, lane: 'verkennen' },
    { id: 'inspiratie', scenarioId: 'UAT-BEZIT-04', label: 'WF-BEZIT-04 · Inspiratie-inzichten', kind: 'screen', stage: 2, lane: 'verkennen' },
    { id: 'categorie', scenarioId: 'UAT-BEZIT-11', label: 'WF-BEZIT-11 · Categoriepagina per type', kind: 'screen', stage: 2, lane: 'verkennen' },

    // ── 2 · toevoegen ─────────────────────────────────────────────────────
    { id: 'add', scenarioId: 'UAT-BEZIT-05', label: 'WF-BEZIT-05 · Bezitting toevoegen (QuickAdd)', kind: 'action', stage: 2, lane: 'toevoegen' },
    { id: 'huisbeslis', label: 'Eigen woning?', kind: 'decision', stage: 2, lane: 'toevoegen' },
    { id: 'hypotheek', label: 'Hypotheek koppelen', kind: 'cross', stage: 2, lane: 'toevoegen', crossZone: 'SCHULD' },

    // ── 2 · beheren ───────────────────────────────────────────────────────
    { id: 'pane', scenarioId: 'UAT-BEZIT-06', label: 'WF-BEZIT-06 · Detail-pane (kaart-klik)', kind: 'screen', stage: 2, lane: 'beheren' },
    { id: 'edit', scenarioId: 'UAT-BEZIT-07', label: 'WF-BEZIT-07 · Bewerken', kind: 'screen', stage: 2, lane: 'beheren', subOf: 'pane' },
    { id: 'herwaarderen', scenarioId: 'UAT-BEZIT-08', label: 'WF-BEZIT-08 · Herwaarderen', kind: 'action', stage: 2, lane: 'beheren', subOf: 'pane' },
    { id: 'verwijderen', scenarioId: 'UAT-BEZIT-10', label: 'WF-BEZIT-10 · Verwijderen', kind: 'action', stage: 2, lane: 'beheren', subOf: 'pane' },
    { id: 'eigendom', scenarioId: 'UAT-BEZIT-24', label: 'WF-BEZIT-24 · Eigendom instellen', kind: 'screen', stage: 2, lane: 'beheren', subOf: 'pane' },
    { id: 'bulk', scenarioId: 'UAT-BEZIT-09', label: 'WF-BEZIT-09 · Alles herwaarderen (bulk)', kind: 'action', stage: 2, lane: 'beheren' },

    // ── 3 · verdieping · beleggingen ──────────────────────────────────────
    { id: 'holdings', scenarioId: 'UAT-BEZIT-12', label: 'WF-BEZIT-12 · Aandelen-holdings-app', kind: 'screen', stage: 3, lane: 'verdieping' },
    { id: 'holdings-koppel', scenarioId: 'UAT-BEZIT-25', label: 'WF-BEZIT-25 · Koppelscherm (nul gekoppeld)', kind: 'screen', stage: 3, lane: 'verdieping', subOf: 'holdings' },
    { id: 'verversen', scenarioId: 'UAT-BEZIT-13', label: 'WF-BEZIT-13 · Koersen verversen', kind: 'action', stage: 3, lane: 'verdieping', subOf: 'holdings' },
    { id: 'holding-add', scenarioId: 'UAT-BEZIT-14', label: 'WF-BEZIT-14 · Holding toevoegen', kind: 'action', stage: 3, lane: 'verdieping', subOf: 'holdings' },
    { id: 'transactie', scenarioId: 'UAT-BEZIT-15', label: 'WF-BEZIT-15 · Transactie registreren', kind: 'action', stage: 3, lane: 'verdieping', subOf: 'holdings' },
    { id: 'holding-pane', scenarioId: 'UAT-BEZIT-16', label: 'WF-BEZIT-16 · Holding detail-pane', kind: 'screen', stage: 3, lane: 'verdieping', subOf: 'holdings' },
    { id: 'holding-pagina', scenarioId: 'UAT-BEZIT-17', label: 'WF-BEZIT-17 · Holding-detailpagina', kind: 'screen', stage: 3, lane: 'verdieping', subOf: 'holdings' },
    { id: 'csv', scenarioId: 'UAT-BEZIT-18', label: 'WF-BEZIT-18 · CSV-import (broker-export)', kind: 'action', stage: 3, lane: 'verdieping', subOf: 'holdings' },
    { id: 'broker', label: 'WF-BEZIT-19 · Broker-koppeling (Trading 212)', kind: 'cross', stage: 3, lane: 'verdieping', subOf: 'holdings', crossZone: 'MIJN' },
    { id: 'typed-inv', scenarioId: 'UAT-BEZIT-22', label: 'WF-BEZIT-22 · Typed investment-positie', kind: 'screen', stage: 3, lane: 'verdieping', subOf: 'holdings' },

    // ── 3 · verdieping · crypto ───────────────────────────────────────────
    { id: 'crypto', scenarioId: 'UAT-BEZIT-21', label: 'WF-BEZIT-21 · Crypto-holdings-app', kind: 'screen', stage: 3, lane: 'verdieping' },
    { id: 'crypto-koppel', scenarioId: 'UAT-BEZIT-25', label: 'WF-BEZIT-25 · Koppelscherm (nul gekoppeld)', kind: 'screen', stage: 3, lane: 'verdieping', subOf: 'crypto' },
    { id: 'koppeling', label: 'WF-BEZIT-20 · Exchange-/wallet-koppeling', kind: 'cross', stage: 3, lane: 'verdieping', subOf: 'crypto', crossZone: 'MIJN' },
    { id: 'typed-crypto', scenarioId: 'UAT-BEZIT-22', label: 'WF-BEZIT-22 · Typed crypto-coin', kind: 'screen', stage: 3, lane: 'verdieping', subOf: 'crypto' },

    // ── 3 · verdieping · vastgoed ─────────────────────────────────────────
    { id: 'verhuur', scenarioId: 'UAT-BEZIT-23', label: 'WF-BEZIT-23 · Verhuurrendement-tool', kind: 'screen', stage: 3, lane: 'verdieping' },

    // ── 4 · uitkomst ──────────────────────────────────────────────────────
    { id: 'netto', label: 'Netto vermogen & vrijheidstijd bijgewerkt', kind: 'outcome', stage: 4 },

    // ── 5 · cross-doorwerking ─────────────────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht-hero', kind: 'cross', stage: 5, crossZone: 'OVZ' },
    { id: 'x-belast', label: 'Box 3 (belasting)', kind: 'cross', stage: 5, crossZone: 'BELAST' },
    { id: 'x-toek', label: 'FIRE-projectie', kind: 'cross', stage: 5, crossZone: 'TOEK' },
  ],
  edges: [
    // instap → hub
    { from: 'nav', to: 'leeg' },
    { from: 'leeg', to: 'ovz' },

    // hub → verkennen
    { from: 'ovz', to: 'filter' },
    { from: 'ovz', to: 'verdeling' },
    { from: 'ovz', to: 'inspiratie' },
    { from: 'ovz', to: 'categorie' },

    // hub → toevoegen
    { from: 'ovz', to: 'add' },
    { from: 'add', to: 'huisbeslis' },
    { from: 'huisbeslis', to: 'hypotheek', kind: 'cross', label: 'ja, eigen woning' },

    // hub → beheren
    { from: 'ovz', to: 'pane' },
    { from: 'pane', to: 'edit' },
    { from: 'pane', to: 'herwaarderen' },
    { from: 'pane', to: 'verwijderen' },
    { from: 'pane', to: 'eigendom' },
    { from: 'ovz', to: 'bulk' },

    // verkennen → verdieping (branch per categorie)
    { from: 'categorie', to: 'holdings', kind: 'branch' },
    { from: 'categorie', to: 'crypto', kind: 'branch' },
    { from: 'categorie', to: 'verhuur', kind: 'branch' },

    // beleggingen sub-hub → kinderen (rail)
    { from: 'holdings', to: 'holdings-koppel' },
    { from: 'holdings', to: 'verversen' },
    { from: 'holdings', to: 'holding-add' },
    { from: 'holdings', to: 'transactie' },
    { from: 'holdings', to: 'holding-pane' },
    { from: 'holdings', to: 'holding-pagina' },
    { from: 'holdings', to: 'csv' },
    { from: 'holdings', to: 'broker', kind: 'cross' },
    { from: 'holdings', to: 'typed-inv' },

    // crypto sub-hub → kinderen (rail)
    { from: 'crypto', to: 'crypto-koppel' },
    { from: 'crypto', to: 'koppeling', kind: 'cross' },
    { from: 'crypto', to: 'typed-crypto' },

    // samenvloeien → uitkomst
    { from: 'add', to: 'netto' },
    { from: 'bulk', to: 'netto' },
    { from: 'pane', to: 'netto' },
    { from: 'holdings', to: 'netto' },
    { from: 'crypto', to: 'netto' },
    { from: 'verhuur', to: 'netto' },

    // uitkomst → cross-doorwerking
    { from: 'netto', to: 'x-ovz', kind: 'cross' },
    { from: 'netto', to: 'x-belast', kind: 'cross' },
    { from: 'netto', to: 'x-toek', kind: 'cross' },
  ],
}

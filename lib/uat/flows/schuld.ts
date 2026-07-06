// Gecureerde Schuld-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Schulden & hypotheek (WF-SCHULD)"
// (WF-SCHULD-01..18, 20, 21, 22) en de acceptatie in lib/uat/acceptance/schuld.ts.
// De knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-SCHULD-NN) en erven daarmee de rondestatus. Het label
// toont bewust het WF-nummer, spiegelt lib/uat/flows/bezit.ts + toek.ts.
//
// Het proces leest links→rechts: instap (lege staat?) → schulden-hub → verkennen
// (filteren/categoriepagina) → toevoegen (hypotheek vs. consumptief krediet) →
// beheren (detail-pane: bewerken/herwaarderen/aflossen/verwijderen) → aflosroute
// (Avalanche/Sneeuwbal) → hypotheek-verdieping (woning koppelen/LTV, planner,
// hypotheek-vs-beleggen) → DGA-verdieping → voorkeuren (spaarquote-inclusie,
// netto-vermogen-inclusie, gedeeld) → doorwerking (Box 1, gezondheidsscore) →
// uitkomst (totale schuld & netto vermogen) → cross-doorwerking.
//
// WF-SCHULD-19 (eenvoudige weergave) is een VERWIJSREGEL naar UAT-NAV-10 en heeft
// bewust GEEN eigen SCHULD-scenario (zie lib/uat/acceptance/schuld.ts) — het komt
// hier daarom niet als knoop voor, net zoals WF-TOEK-27/31 in toek.ts ontbreken.
//
// GRONDSLAG-REGEL (CLAUDE.md): een schuld verlaagt zowel de liquide/FIRE-eligible
// grondslag (INPUT voor de horizon-kernel → `x-toek`) als het netto vermogen
// (incl. niet-liquide; OUTPUT-doorwerking → `x-ovz`). De cross-knopen houden die
// grootheden uit elkaar. De eigen woning is een niet-liquide BEZIT-asset dat als
// onderpand aan de hypotheek hangt (`x-bezit`, LTV) — een andere grootheid dan de
// schuld zelf.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const SCHULD_FLOW: UatFlow = {
  zone: 'SCHULD',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar Schulden (/overzicht/schulden)', kind: 'entry', stage: 0 },
    { id: 'leeg', label: 'Al schulden?', kind: 'decision', stage: 0 },
    { id: 'welkom', scenarioId: 'UAT-SCHULD-04', label: 'WF-SCHULD-04 · Eerste gebruik: lege staat & eerste schuld', kind: 'screen', stage: 0, lane: 'instap' },

    // ── 1 · hub ───────────────────────────────────────────────────────────
    { id: 'ovz', scenarioId: 'UAT-SCHULD-01', label: 'WF-SCHULD-01 · Schuldenoverzicht (totalen, categorieën, LTV)', kind: 'screen', stage: 1 },

    // ── 2 · verkennen ─────────────────────────────────────────────────────
    { id: 'filter', scenarioId: 'UAT-SCHULD-02', label: 'WF-SCHULD-02 · Filteren op schuldtype', kind: 'screen', stage: 2, lane: 'verkennen' },
    { id: 'categorie', scenarioId: 'UAT-SCHULD-11', label: 'WF-SCHULD-11 · Categoriepagina per schuldtype', kind: 'screen', stage: 2, lane: 'verkennen' },

    // ── 2 · toevoegen ─────────────────────────────────────────────────────
    { id: 'add', scenarioId: 'UAT-SCHULD-03', label: 'WF-SCHULD-03 · Schuld toevoegen (QuickAdd-wizard)', kind: 'action', stage: 2, lane: 'toevoegen' },
    { id: 'typebeslis', label: 'Hypotheek of consumptief krediet?', kind: 'decision', stage: 2, lane: 'toevoegen' },

    // ── 2 · beheren (detail-pane) ─────────────────────────────────────────
    { id: 'pane', scenarioId: 'UAT-SCHULD-05', label: 'WF-SCHULD-05 · Detail-pane (kaart-klik)', kind: 'screen', stage: 2, lane: 'beheren' },
    { id: 'edit', scenarioId: 'UAT-SCHULD-06', label: 'WF-SCHULD-06 · Bewerken (volledig formulier)', kind: 'screen', stage: 2, lane: 'beheren', subOf: 'pane' },
    { id: 'saldo', scenarioId: 'UAT-SCHULD-07', label: 'WF-SCHULD-07 · Saldo bijwerken (herwaardering)', kind: 'action', stage: 2, lane: 'beheren', subOf: 'pane' },
    { id: 'aflossen0', scenarioId: 'UAT-SCHULD-08', label: 'WF-SCHULD-08 · Volledig aflossen (saldo → 0)', kind: 'action', stage: 2, lane: 'beheren', subOf: 'pane' },
    { id: 'verwijderen', scenarioId: 'UAT-SCHULD-09', label: 'WF-SCHULD-09 · Verwijderen', kind: 'action', stage: 2, lane: 'beheren', subOf: 'pane' },

    // ── 3 · aflosroute ────────────────────────────────────────────────────
    { id: 'aflosroute', scenarioId: 'UAT-SCHULD-10', label: 'WF-SCHULD-10 · Aflosroute (strategie & extra aflossen)', kind: 'screen', stage: 3, lane: 'aflossen' },
    { id: 'stratbeslis', label: 'Avalanche of Sneeuwbal?', kind: 'decision', stage: 3, lane: 'aflossen', subOf: 'aflosroute' },

    // ── 3 · hypotheek-verdieping ──────────────────────────────────────────
    { id: 'koppel', scenarioId: 'UAT-SCHULD-15', label: 'WF-SCHULD-15 · Woning koppelen & LTV zien', kind: 'screen', stage: 3, lane: 'hypotheek' },
    { id: 'planner', scenarioId: 'UAT-SCHULD-12', label: 'WF-SCHULD-12 · Hypotheekplanner activeren', kind: 'action', stage: 3, lane: 'hypotheek' },
    { id: 'gebruik', scenarioId: 'UAT-SCHULD-13', label: 'WF-SCHULD-13 · Hypotheekplanner (equity, amortisatie, mijlpalen)', kind: 'screen', stage: 3, lane: 'hypotheek', subOf: 'planner' },
    { id: 'vergelijk', scenarioId: 'UAT-SCHULD-14', label: 'WF-SCHULD-14 · Hypotheek vs. beleggen vergelijken', kind: 'screen', stage: 3, lane: 'hypotheek', subOf: 'planner' },
    { id: 'x-bezit', label: 'Eigen woning / onderpand (BEZIT-asset)', kind: 'cross', stage: 3, lane: 'hypotheek', crossZone: 'BEZIT' },

    // ── 3 · DGA-verdieping ────────────────────────────────────────────────
    { id: 'dga', scenarioId: 'UAT-SCHULD-20', label: 'WF-SCHULD-20 · DGA-schuld & Wet excessief lenen', kind: 'screen', stage: 3, lane: 'verdieping' },

    // ── 4 · voorkeuren (meetellen) ────────────────────────────────────────
    { id: 'spaarquote', scenarioId: 'UAT-SCHULD-16', label: 'WF-SCHULD-16 · Aflossing meetellen in spaarquote', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'nettoincl', scenarioId: 'UAT-SCHULD-17', label: 'WF-SCHULD-17 · Netto-vermogen-inclusie (%)', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'gedeeld', scenarioId: 'UAT-SCHULD-18', label: 'WF-SCHULD-18 · Gedeelde schuld (huishouden)', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'x-mijn', label: 'Huishoudlid (gedeelde schuld)', kind: 'cross', stage: 4, lane: 'voorkeuren', crossZone: 'MIJN' },

    // ── 4 · doorwerking (eigen SCHULD-scenario's op belasting/gezondheid) ──
    { id: 'box1', scenarioId: 'UAT-SCHULD-21', label: 'WF-SCHULD-21 · Doorwerking Box 1 (hypotheekrenteaftrek)', kind: 'screen', stage: 4, lane: 'doorwerking' },
    { id: 'dsti', scenarioId: 'UAT-SCHULD-22', label: 'WF-SCHULD-22 · Doorwerking gezondheidsscore (DSTI) & Will', kind: 'screen', stage: 4, lane: 'doorwerking' },

    // ── 5 · uitkomst ──────────────────────────────────────────────────────
    { id: 'netto', label: 'Totale schuld, netto vermogen & vrijheidstijd bijgewerkt', kind: 'outcome', stage: 5 },

    // ── 6 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht-hero · netto vermogen + gezondheidsscore (DSTI)', kind: 'cross', stage: 6, crossZone: 'OVZ' },
    { id: 'x-belast', label: 'Belasting · Box 1-renteaftrek & Box 2 DGA-drempel', kind: 'cross', stage: 6, crossZone: 'BELAST' },
    { id: 'x-toek', label: 'FIRE-projectie · sneller schuldvrij = eerder vrij', kind: 'cross', stage: 6, crossZone: 'TOEK' },
  ],
  edges: [
    // instap → hub
    { from: 'nav', to: 'leeg' },
    { from: 'leeg', to: 'welkom', kind: 'branch', label: 'lege staat' },
    { from: 'leeg', to: 'ovz', label: 'al schulden' },
    { from: 'welkom', to: 'ovz' },

    // hub → verkennen
    { from: 'ovz', to: 'filter' },
    { from: 'ovz', to: 'categorie' },

    // hub → toevoegen (beslispunt: hypotheek vs. consumptief)
    { from: 'ovz', to: 'add' },
    { from: 'add', to: 'typebeslis' },
    { from: 'typebeslis', to: 'koppel', kind: 'branch', label: 'hypotheek' },
    { from: 'typebeslis', to: 'pane', kind: 'branch', label: 'consumptief krediet' },

    // hub → beheren (detail-pane rail)
    { from: 'ovz', to: 'pane' },
    { from: 'pane', to: 'edit' },
    { from: 'pane', to: 'saldo' },
    { from: 'pane', to: 'aflossen0' },
    { from: 'pane', to: 'verwijderen' },
    { from: 'pane', to: 'gedeeld' },

    // hub → aflosroute (beslispunt: strategie)
    { from: 'ovz', to: 'aflosroute' },
    { from: 'aflosroute', to: 'stratbeslis' },
    { from: 'aflosroute', to: 'x-toek', kind: 'cross', label: 'extra aflossen → FIRE-projectie' },

    // verkennen/toevoegen → hypotheek-verdieping (rail)
    { from: 'categorie', to: 'koppel', kind: 'branch', label: 'hypotheek' },
    { from: 'koppel', to: 'x-bezit', kind: 'cross', label: 'woning als onderpand (LTV)' },
    { from: 'koppel', to: 'planner' },
    { from: 'planner', to: 'gebruik' },
    { from: 'planner', to: 'vergelijk' },
    { from: 'gebruik', to: 'box1', kind: 'branch', label: 'renteaftrek' },

    // hub → DGA-verdieping
    { from: 'ovz', to: 'dga' },
    { from: 'dga', to: 'x-belast', kind: 'cross', label: 'Box 2 · excessief lenen' },

    // hub → voorkeuren
    { from: 'ovz', to: 'spaarquote' },
    { from: 'ovz', to: 'nettoincl' },
    { from: 'gedeeld', to: 'x-mijn', kind: 'cross', label: 'split met huishoudlid' },

    // hub → doorwerking
    { from: 'ovz', to: 'dsti' },
    { from: 'box1', to: 'x-belast', kind: 'cross' },
    { from: 'dsti', to: 'x-ovz', kind: 'cross' },

    // samenvloeien → uitkomst
    { from: 'add', to: 'netto' },
    { from: 'edit', to: 'netto' },
    { from: 'saldo', to: 'netto' },
    { from: 'aflossen0', to: 'netto' },
    { from: 'verwijderen', to: 'netto' },
    { from: 'stratbeslis', to: 'netto' },
    { from: 'aflosroute', to: 'netto' },
    { from: 'koppel', to: 'netto' },
    { from: 'gebruik', to: 'netto' },
    { from: 'spaarquote', to: 'netto' },
    { from: 'nettoincl', to: 'netto' },
    { from: 'gedeeld', to: 'netto' },
    { from: 'dga', to: 'netto' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'netto', to: 'x-ovz', kind: 'cross' },
    { from: 'netto', to: 'x-belast', kind: 'cross' },
    { from: 'netto', to: 'x-toek', kind: 'cross' },
  ],
}

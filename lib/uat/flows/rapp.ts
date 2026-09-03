// Gecureerde Rapp-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Rapportages (WF-RAPP)" (WF-RAPP-01..13)
// en de acceptatie in lib/uat/acceptance/rapp.ts. De knopen met `scenarioId`
// verwijzen naar de UAT-scenario-ID's uit lib/uat/catalog.ts (UAT-RAPP-NN) en
// erven daarmee de rondestatus. Het label toont bewust het WF-nummer, spiegelt
// lib/uat/flows/budget.ts + start.ts + will.ts + cash.ts + ovz.ts + nav.ts.
//
// RAPP is — anders dan SCHULD/TOEK/WILL/OVZ/NAV — WEL aaneengesloten op
// WF-nummer: alle 13 WF-RAPP-01..13 hebben een eigen knoop hieronder.
//
// Het proces leest links→rechts: instap (hub) → genereren (periodiek/AI) →
// archief (heropenen/verwijderen) → rapporttypen (balans/budget/vermogen/
// persoonlijk plan) → benchmark (spiegel + detail) → randvoorwaarden
// (printen/masking) → uitkomst → cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md / zone-specifieke notitie): een rapport
// CONSUMEERT alleen cijfers uit de bronschermen (Bezit/Schuld/Overzicht/
// Toekomst) — het herberekent nooit zelf. Vandaar de `kind:'cross'`-knopen
// met stippellijn naar die bronschermen; RAPP zelf heeft 6 'exact'-knopen
// (de rapport-formules zijn 100% deterministisch op de vaste testdata) en
// 6 'ui-only' + 1 'consistency' (archief-cache).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const RAPP_FLOW: UatFlow = {
  zone: 'RAPP',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'hub', scenarioId: 'UAT-RAPP-01', label: 'WF-RAPP-01 · Rapportage-hub openen en oriënteren', kind: 'entry', stage: 0 },

    // ── 1 · genereren (periodiek rapport) ────────────────────────────────
    { id: 'periodiek', scenarioId: 'UAT-RAPP-02', label: 'WF-RAPP-02 · Periodiek rapport genereren (maand/kwartaal/jaar)', kind: 'screen', stage: 1, lane: 'genereren' },
    { id: 'periodiekai', scenarioId: 'UAT-RAPP-03', label: 'WF-RAPP-03 · Periodiek rapport met AI-inleiding', kind: 'action', stage: 1, lane: 'genereren', subOf: 'periodiek' },

    // ── 2 · archief ───────────────────────────────────────────────────────
    { id: 'archiefheropen', scenarioId: 'UAT-RAPP-04', label: 'WF-RAPP-04 · Opgeslagen rapport heropenen (cache)', kind: 'action', stage: 2, lane: 'archief' },
    { id: 'archiefverwijder', scenarioId: 'UAT-RAPP-05', label: 'WF-RAPP-05 · Rapport uit archief verwijderen', kind: 'action', stage: 2, lane: 'archief' },

    // ── 3 · rapporttypen ──────────────────────────────────────────────────
    { id: 'balans', scenarioId: 'UAT-RAPP-06', label: 'WF-RAPP-06 · Balansstaat op peildatum', kind: 'screen', stage: 3, lane: 'rapporttypen' },
    { id: 'budgetrapport', scenarioId: 'UAT-RAPP-07', label: 'WF-RAPP-07 · Budgetrapport voor een maand', kind: 'screen', stage: 3, lane: 'rapporttypen' },
    { id: 'vermogensoverzicht', scenarioId: 'UAT-RAPP-08', label: 'WF-RAPP-08 · Vermogensoverzicht op peildatum', kind: 'screen', stage: 3, lane: 'rapporttypen' },
    { id: 'persoonlijkplan', scenarioId: 'UAT-RAPP-09', label: 'WF-RAPP-09 · Persoonlijk plan + aannames controleren', kind: 'screen', stage: 3, lane: 'rapporttypen' },

    // ── 4 · benchmark ─────────────────────────────────────────────────────
    { id: 'benchmark', scenarioId: 'UAT-RAPP-10', label: 'WF-RAPP-10 · Benchmark-spiegel openen', kind: 'screen', stage: 4, lane: 'benchmark' },
    { id: 'benchmarkdetail', scenarioId: 'UAT-RAPP-11', label: 'WF-RAPP-11 · Benchmark-cijfer aanklikken (detail-sheet)', kind: 'action', stage: 4, lane: 'benchmark', subOf: 'benchmark' },
    { id: 'vrijheidstijdrapport', scenarioId: 'UAT-RAPP-14', label: 'WF-RAPP-14 · Vrijheidstijd op benchmark + totaalplan (canoniek dagtarief)', kind: 'screen', stage: 4, lane: 'benchmark', subOf: 'benchmark' },
    { id: 'totaalplanslagingskans', scenarioId: 'UAT-RAPP-15', label: 'WF-RAPP-15 · Totaalplan-slagingskans volgt jaargelaagde marktvolatiliteit (ADR 0117)', kind: 'screen', stage: 3, lane: 'rapporttypen', subOf: 'persoonlijkplan' },

    // ── 5 · randvoorwaarden ───────────────────────────────────────────────
    { id: 'print', scenarioId: 'UAT-RAPP-12', label: 'WF-RAPP-12 · Rapport afdrukken als PDF', kind: 'action', stage: 5, lane: 'randvoorwaarden' },
    { id: 'masking', scenarioId: 'UAT-RAPP-13', label: 'WF-RAPP-13 · Bekijken met privacy-masking', kind: 'action', stage: 5, lane: 'randvoorwaarden' },

    // ── 6 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Betrouwbaar, consumerend rapportage-overzicht', kind: 'outcome', stage: 6 },

    // ── 7 · cross-doorwerking (INPUT — rapporten consumeren bronschermen) ──
    { id: 'x-bezit', label: 'Bezit · bezittingen voeden balans/vermogensoverzicht', kind: 'cross', stage: 7, crossZone: 'BEZIT' },
    { id: 'x-schuld', label: 'Schuld · schulden voeden balans/vermogensoverzicht', kind: 'cross', stage: 7, crossZone: 'SCHULD' },
    { id: 'x-ovz', label: 'Overzicht · netto vermogen/perspectief/masking-toggle', kind: 'cross', stage: 7, crossZone: 'OVZ' },
    { id: 'x-toek', label: 'Toekomst · FIRE-eligible grondslag voor het periodieke rapport', kind: 'cross', stage: 7, crossZone: 'TOEK' },
  ],
  edges: [
    // instap → genereren
    { from: 'hub', to: 'periodiek' },
    { from: 'periodiek', to: 'periodiekai' },

    // instap → archief
    { from: 'hub', to: 'archiefheropen' },
    { from: 'hub', to: 'archiefverwijder' },
    { from: 'periodiek', to: 'archiefheropen', label: 'opgeslagen als report_configs' },

    // instap → rapporttypen
    { from: 'hub', to: 'balans' },
    { from: 'hub', to: 'budgetrapport' },
    { from: 'hub', to: 'vermogensoverzicht' },
    { from: 'hub', to: 'persoonlijkplan' },

    // instap → benchmark
    { from: 'hub', to: 'benchmark' },
    { from: 'benchmark', to: 'benchmarkdetail' },
    { from: 'benchmark', to: 'vrijheidstijdrapport' },
    { from: 'persoonlijkplan', to: 'vrijheidstijdrapport' },

    // instap → randvoorwaarden
    { from: 'balans', to: 'print' },
    { from: 'vermogensoverzicht', to: 'print' },
    { from: 'hub', to: 'masking' },

    // consumeert bronschermen
    { from: 'balans', to: 'x-bezit', kind: 'cross' },
    { from: 'balans', to: 'x-schuld', kind: 'cross' },
    { from: 'vermogensoverzicht', to: 'x-bezit', kind: 'cross' },
    { from: 'vermogensoverzicht', to: 'x-schuld', kind: 'cross' },
    { from: 'benchmark', to: 'x-ovz', kind: 'cross' },
    { from: 'masking', to: 'x-ovz', kind: 'cross', label: 'app-brede toggle = UAT-NAV-11' },
    { from: 'periodiek', to: 'x-toek', kind: 'cross', label: 'FIRE-voortgang naast vol netto vermogen' },

    // samenvloeien → uitkomst
    { from: 'periodiekai', to: 'uitkomst' },
    { from: 'archiefheropen', to: 'uitkomst' },
    { from: 'archiefverwijder', to: 'uitkomst' },
    { from: 'budgetrapport', to: 'uitkomst' },
    { from: 'persoonlijkplan', to: 'uitkomst' },
    { from: 'benchmarkdetail', to: 'uitkomst' },
    { from: 'print', to: 'uitkomst' },
    { from: 'masking', to: 'uitkomst' },
    { from: 'x-bezit', to: 'uitkomst' },
    { from: 'x-schuld', to: 'uitkomst' },
    { from: 'x-ovz', to: 'uitkomst' },
    { from: 'x-toek', to: 'uitkomst' },
  ],
}

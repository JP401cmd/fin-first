// Gecureerde Budget-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Budgetteren (WF-BUDGET)" (WF-BUDGET-01..25)
// en de acceptatie in lib/uat/acceptance/budget.ts. De knopen met `scenarioId`
// verwijzen naar de UAT-scenario-ID's uit lib/uat/catalog.ts (UAT-BUDGET-NN) en
// erven daarmee de rondestatus. Het label toont bewust het WF-nummer, spiegelt
// lib/uat/flows/schuld.ts + toek.ts.
//
// BUDGET is — anders dan SCHULD (WF-19 ontbreekt) en TOEK (WF-27/31 ontbreken) —
// een AANEENGESLOTEN catalogus: alle WF-BUDGET-01..25 hebben een eigen
// UAT-scenario en dus een eigen knoop hieronder. Geen verwijsregel-gaten.
// WF-BUDGET-25 (later toegevoegd) dekt de sleepmodus' +-knop ("Nieuw budget
// toevoegen") — een escape-hatch die vanuit de Budget Hub, /core/cash en de
// import-flow bereikbaar is; hier gemodelleerd als een sub-knoop van 'nieuw'
// omdat het dezelfde uitkomst (budget aanmaken) via een ander instappunt is.
//
// Het proces leest links→rechts: instap (setup gedaan?) → budgethub (plan vs.
// realisatie) → verkennen (analyse-hub/NIBUD-benchmark/eigen-rekening/deeplinks)
// → toevoegen (nieuw budget vs. template-VERVANG) → beheren (detail-pane-rail:
// detail/bewerken/archiveren/volgorde/tx-bewerken/spaardoel/Fin-advies) →
// planeditor (plan bewerken + kopieer-vorige-maand) → periode & weergave (maand-
// nav/periodemodus + Boom-Ring-Heatmap-Pillen) → voorkeuren (rollover/
// voorspelling/gedeeld budgetteren) → doorwerking (categorisatie vanuit Cash +
// maandrapport) → uitkomst (budget-dekking, resterend & vrijheidstijd) →
// cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md): budget-realisatie (besteed per maand) komt van
// Cash-transacties (`x-cash`, INPUT) en is NIET hand-narekenbaar (jitter in de
// persona-generator) — vandaar dat WF-BUDGET-02/13/16/21 'consistency'/'direction'
// zijn in budget.ts, niet 'exact'. Budget-limieten zelf zijn wél statisch/exact.
// Gedeeld budgetteren (`x-mijn`) en de doorwerking naar FIRE-essentieel (`x-toek`)
// en het gezondheidsgetal (`x-ovz`) zijn afzonderlijke grootheden — net als bij
// SCHULD blijven die uit elkaar gehouden.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const BUDGET_FLOW: UatFlow = {
  zone: 'BUDGET',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar Budgetteren (/overzicht/budget)', kind: 'entry', stage: 0 },
    { id: 'setupgedaan', label: 'Setup gedaan?', kind: 'decision', stage: 0 },
    { id: 'setup', scenarioId: 'UAT-BUDGET-01', label: 'WF-BUDGET-01 · Budgetteren voor het eerst instellen', kind: 'screen', stage: 0, lane: 'instap' },

    // ── 1 · hub ───────────────────────────────────────────────────────────
    { id: 'hub', scenarioId: 'UAT-BUDGET-02', label: 'WF-BUDGET-02 · Budget-vs-realisatie van de maand', kind: 'screen', stage: 1 },
    { id: 'degraded', scenarioId: 'UAT-BUDGET-27', label: 'WF-BUDGET-27 · Mislukte her-fetch verbergt de pagina niet meer', kind: 'action', stage: 1, subOf: 'hub' },

    // ── 2 · verkennen ─────────────────────────────────────────────────────
    { id: 'analysehub', scenarioId: 'UAT-BUDGET-05', label: 'WF-BUDGET-05 · Budgetanalyse-hub', kind: 'screen', stage: 2, lane: 'verkennen' },
    { id: 'nibud', scenarioId: 'UAT-BUDGET-22', label: 'WF-BUDGET-22 · NIBUD-benchmark raadplegen', kind: 'screen', stage: 2, lane: 'verkennen', subOf: 'analysehub' },
    { id: 'eigenrekening', scenarioId: 'UAT-BUDGET-21', label: 'WF-BUDGET-21 · Verborgen categorieën & Eigen rekening', kind: 'screen', stage: 2, lane: 'verkennen' },
    { id: 'deeplinks', scenarioId: 'UAT-BUDGET-23', label: 'WF-BUDGET-23 · Deeplinks & legacy-routes', kind: 'screen', stage: 2, lane: 'verkennen' },

    // ── 2 · toevoegen ─────────────────────────────────────────────────────
    { id: 'nieuw', scenarioId: 'UAT-BUDGET-08', label: 'WF-BUDGET-08 · Nieuw budget (uitgebreid formulier)', kind: 'action', stage: 2, lane: 'toevoegen' },
    { id: 'templatebeslis', label: 'Template of handmatig?', kind: 'decision', stage: 2, lane: 'toevoegen' },
    { id: 'template', scenarioId: 'UAT-BUDGET-07', label: 'WF-BUDGET-07 · Template toepassen (VERVANG-flow)', kind: 'action', stage: 2, lane: 'toevoegen' },
    { id: 'sleepmodusnieuw', scenarioId: 'UAT-BUDGET-25', label: 'WF-BUDGET-25 · Nieuw budget via sleepmodus (+-knop)', kind: 'action', stage: 2, lane: 'toevoegen', subOf: 'nieuw' },
    { id: 'x-cash-sleep', label: 'Sleepmodus-instap (/core/cash & import)', kind: 'cross', stage: 2, lane: 'toevoegen', crossZone: 'CASH' },

    // ── 2 · beheren (detail-pane rail) ─────────────────────────────────────
    { id: 'detail', scenarioId: 'UAT-BUDGET-09', label: 'WF-BUDGET-09 · Budgetdetail (donut, historie, vrijheidstijd)', kind: 'screen', stage: 2, lane: 'beheren' },
    { id: 'bewerken', scenarioId: 'UAT-BUDGET-10', label: 'WF-BUDGET-10 · Bewerken via bewerk-paneel (ingangsmaand)', kind: 'screen', stage: 2, lane: 'beheren', subOf: 'detail' },
    { id: 'archiveren', scenarioId: 'UAT-BUDGET-11', label: 'WF-BUDGET-11 · Archiveren/verwijderen', kind: 'action', stage: 2, lane: 'beheren', subOf: 'detail' },
    { id: 'volgorde', scenarioId: 'UAT-BUDGET-12', label: 'WF-BUDGET-12 · Budgetvolgorde aanpassen', kind: 'action', stage: 2, lane: 'beheren' },
    { id: 'txbewerken', scenarioId: 'UAT-BUDGET-17', label: 'WF-BUDGET-17 · Transactie openen/bewerken vanuit detail', kind: 'action', stage: 2, lane: 'beheren', subOf: 'detail' },
    { id: 'spaardoel', scenarioId: 'UAT-BUDGET-18', label: 'WF-BUDGET-18 · Spaardoel koppelen aan spaarbudget', kind: 'screen', stage: 2, lane: 'beheren', subOf: 'detail' },
    { id: 'will', scenarioId: 'UAT-BUDGET-19', label: 'WF-BUDGET-19 · Fin om budgetadvies vragen', kind: 'action', stage: 2, lane: 'beheren', subOf: 'detail' },

    // ── 3 · planeditor ────────────────────────────────────────────────────
    { id: 'plan', scenarioId: 'UAT-BUDGET-06', label: 'WF-BUDGET-06 · Budgetplan bewerken in de planeditor', kind: 'screen', stage: 3, lane: 'planeditor' },
    { id: 'kopieer', scenarioId: 'UAT-BUDGET-16', label: 'WF-BUDGET-16 · Budgetbedragen vorige maand kopiëren', kind: 'action', stage: 3, lane: 'planeditor', subOf: 'plan' },

    // ── 3 · periode & weergave ─────────────────────────────────────────────
    { id: 'periode', scenarioId: 'UAT-BUDGET-03', label: 'WF-BUDGET-03 · Maand navigeren & periodemodus wisselen', kind: 'screen', stage: 3, lane: 'periode' },
    { id: 'weergave', scenarioId: 'UAT-BUDGET-04', label: 'WF-BUDGET-04 · Weergavemodus wisselen (Boom/Ring/Heatmap/Pillen)', kind: 'screen', stage: 3, lane: 'periode' },

    // ── 4 · voorkeuren ────────────────────────────────────────────────────
    { id: 'rollover', scenarioId: 'UAT-BUDGET-14', label: 'WF-BUDGET-14 · Overschot doorschuiven (rollover)', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'rolloverbeslis', label: 'Rollover doorschuiven?', kind: 'decision', stage: 4, lane: 'voorkeuren', subOf: 'rollover' },
    { id: 'voorspelling', scenarioId: 'UAT-BUDGET-15', label: 'WF-BUDGET-15 · Voorspelling volgende maand ("Hoe berekend?")', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'gedeeld', scenarioId: 'UAT-BUDGET-20', label: 'WF-BUDGET-20 · Gedeeld budgetteren (huishoud-perspectief)', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'x-mijn', label: 'Huishoudlid (partner-potjes, aandeel%)', kind: 'cross', stage: 4, lane: 'voorkeuren', crossZone: 'MIJN' },

    // ── 4 · doorwerking ───────────────────────────────────────────────────
    { id: 'categorisatie', scenarioId: 'UAT-BUDGET-13', label: 'WF-BUDGET-13 · Doorwerking: categorisering → budgetrealisatie', kind: 'action', stage: 4, lane: 'doorwerking' },
    { id: 'x-cash', label: 'Transacties & categorisatie (Cash-import)', kind: 'cross', stage: 4, lane: 'doorwerking', crossZone: 'CASH' },
    { id: 'rapport', scenarioId: 'UAT-BUDGET-24', label: 'WF-BUDGET-24 · Maandelijks budgetrapport openen', kind: 'screen', stage: 4, lane: 'doorwerking' },
    { id: 'grondslag', scenarioId: 'UAT-BUDGET-26', label: 'WF-BUDGET-26 · Doorwerking: budgetten als grondslag voor inkomen/uitgaven (ADR 0103)', kind: 'action', stage: 4, lane: 'doorwerking' },

    // ── 5 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Budget-dekking, resterend & vrijheidstijd bijgewerkt', kind: 'outcome', stage: 5 },

    // ── 6 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht-hero · dekkingsgraad & gezondheidsscore', kind: 'cross', stage: 6, crossZone: 'OVZ' },
    { id: 'x-toek', label: 'FIRE-projectie · essentiële budgetten = vaste-lasten-grondslag', kind: 'cross', stage: 6, crossZone: 'TOEK' },
    { id: 'x-rapp', label: 'Rapportages · maandelijks budgetrapport', kind: 'cross', stage: 6, crossZone: 'RAPP' },
  ],
  edges: [
    // instap → hub
    { from: 'nav', to: 'setupgedaan' },
    { from: 'setupgedaan', to: 'setup', kind: 'branch', label: 'nog niet ingesteld' },
    { from: 'setupgedaan', to: 'hub', label: 'al ingesteld' },
    { from: 'setup', to: 'hub' },

    // hub → verkennen
    { from: 'hub', to: 'analysehub' },
    { from: 'analysehub', to: 'nibud' },
    { from: 'hub', to: 'eigenrekening' },
    { from: 'hub', to: 'deeplinks' },

    // hub → toevoegen (beslispunt: template vs. handmatig)
    { from: 'hub', to: 'nieuw' },
    { from: 'hub', to: 'templatebeslis' },
    { from: 'templatebeslis', to: 'nieuw', kind: 'branch', label: 'handmatig' },
    { from: 'templatebeslis', to: 'template', kind: 'branch', label: 'template' },
    { from: 'nieuw', to: 'sleepmodusnieuw' },
    { from: 'sleepmodusnieuw', to: 'x-cash-sleep', kind: 'cross', label: 'sleepmodus ook bereikbaar vanuit Cash/import' },

    // hub → beheren (detail-pane rail)
    { from: 'hub', to: 'detail' },
    { from: 'detail', to: 'bewerken' },
    { from: 'detail', to: 'archiveren' },
    { from: 'detail', to: 'txbewerken' },
    { from: 'detail', to: 'spaardoel' },
    { from: 'detail', to: 'will' },
    { from: 'hub', to: 'volgorde' },

    // hub → planeditor
    { from: 'hub', to: 'plan' },
    { from: 'plan', to: 'kopieer' },

    // hub → periode & weergave
    { from: 'hub', to: 'periode' },
    { from: 'periode', to: 'weergave' },

    // hub → voorkeuren
    { from: 'hub', to: 'rollover' },
    { from: 'rollover', to: 'rolloverbeslis' },
    { from: 'hub', to: 'voorspelling' },
    { from: 'hub', to: 'gedeeld' },
    { from: 'gedeeld', to: 'x-mijn', kind: 'cross', label: 'split met huishoudlid' },

    // hub → doorwerking
    { from: 'hub', to: 'categorisatie' },
    { from: 'categorisatie', to: 'x-cash', kind: 'cross', label: 'transactie → budget' },
    { from: 'hub', to: 'rapport' },
    { from: 'rapport', to: 'x-rapp', kind: 'cross' },
    { from: 'hub', to: 'grondslag' },
    { from: 'grondslag', to: 'x-cash', kind: 'cross', label: 'grondslagkeuze op /overzicht/budget' },
    { from: 'grondslag', to: 'uitkomst' },

    // samenvloeien → uitkomst
    { from: 'nieuw', to: 'uitkomst' },
    { from: 'sleepmodusnieuw', to: 'uitkomst' },
    { from: 'template', to: 'uitkomst' },
    { from: 'bewerken', to: 'uitkomst' },
    { from: 'archiveren', to: 'uitkomst' },
    { from: 'volgorde', to: 'uitkomst' },
    { from: 'txbewerken', to: 'uitkomst' },
    { from: 'spaardoel', to: 'uitkomst' },
    { from: 'plan', to: 'uitkomst' },
    { from: 'rolloverbeslis', to: 'uitkomst' },
    { from: 'voorspelling', to: 'uitkomst' },
    { from: 'gedeeld', to: 'uitkomst' },
    { from: 'categorisatie', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-ovz', kind: 'cross' },
    { from: 'uitkomst', to: 'x-toek', kind: 'cross' },
  ],
}

// Gecureerde Cash-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Cashflow, transacties & bankimport
// (WF-CASH)" (WF-CASH-01..31, WF-CASH-31 als latere dekkingscontrole-
// toevoeging) en de acceptatie in lib/uat/acceptance/cash.ts. De knopen met
// `scenarioId` verwijzen naar de UAT-scenario-ID's uit lib/uat/catalog.ts
// (UAT-CASH-NN) en erven daarmee de rondestatus. Het label toont bewust het
// WF-nummer, spiegelt lib/uat/flows/budget.ts + start.ts + will.ts.
//
// CASH is — net als BUDGET/START — een AANEENGESLOTEN catalogus: alle
// WF-CASH-01..31 hebben een eigen UAT-scenario en dus een eigen knoop
// hieronder (drie daarvan — UAT-CASH-25/26/28 — dragen de WF-code in hun naam
// i.p.v. het `wf`-veld, zie cash.engine.test.ts-normalisatie).
//
// Het proces leest links→rechts: landing (4 hefboom-kaarten) → verkennen
// (maand-geldstroom/kassabon/rekeningen/instellingen/inflatie/status) →
// analyse (periode/inzichten/zoeken) → transactiebeheer (toevoegen/bewerken/
// splitsen/verwijderen/tegenpartij) → vaste lasten (bekijken/classificeren/
// opzeggen/AI/wat-als/kalender/forecast/regelbeheer) → bankimport (MT940-CSV/
// AI-cat/handmatig-cat/eigen-rekening/sleepmodus/foutherstel) → bank koppelen
// → uitkomst → cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md / zone-specifieke notitie): Daans 15-maands
// seedhistorie draagt bewuste jitter — maandtotalen/spaarquote/vaste-lasten-
// SOM zijn daarom 'consistency'/'direction' in cash.ts, niet 'exact'. De
// bankimport-parsers en de meeste rekenkernen (statusdrempels, periode-
// vensters, forecast, tegenpartij-analyse, recurring-totalen) zijn wél
// volledig pure en 'exact' — de kern van deze zone. AI (Vraag Will/analyse)
// en de TrueLayer-koppeling zijn 'ui-only' resp. BLOCKED (sandbox vereist).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const CASH_FLOW: UatFlow = {
  zone: 'CASH',
  nodes: [
    // ── 0 · landing ───────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar /overzicht/cashflow', kind: 'entry', stage: 0 },
    { id: 'hefboom', scenarioId: 'UAT-CASH-01', label: 'WF-CASH-01 · Vier hefboom-kaarten (Budget/Transacties/Vaste lasten/Forecast)', kind: 'screen', stage: 0, lane: 'landing' },

    // ── 1 · verkennen ─────────────────────────────────────────────────────
    { id: 'geldstroom', scenarioId: 'UAT-CASH-02', label: 'WF-CASH-02 · Maand-geldstroom bekijken', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'kassabon', scenarioId: 'UAT-CASH-03', label: 'WF-CASH-03 · Kassabon inkomsten/uitgaven', kind: 'screen', stage: 1, lane: 'verkennen', subOf: 'geldstroom' },
    { id: 'rekeningen', scenarioId: 'UAT-CASH-04', label: 'WF-CASH-04 · Rekeningen & rekeningdetail', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'instellingen', scenarioId: 'UAT-CASH-05', label: 'WF-CASH-05 · Cashflow-instellingen (inkomen/spaarquote/uitgaven)', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'inflatie', scenarioId: 'UAT-CASH-06', label: 'WF-CASH-06 · Inflatie-impact verkennen', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'statusmelding', scenarioId: 'UAT-CASH-07', label: 'WF-CASH-07 · Status-melding minimaliseren/heropenen', kind: 'screen', stage: 1, lane: 'verkennen' },

    // ── 2 · analyse ───────────────────────────────────────────────────────
    { id: 'periode', scenarioId: 'UAT-CASH-08', label: 'WF-CASH-08 · Analyse-periode kiezen & historie bladeren', kind: 'screen', stage: 2, lane: 'analyse' },
    { id: 'inzichten', scenarioId: 'UAT-CASH-09', label: 'WF-CASH-09 · Geldstroom-inzichten (gauge/heatmap/trend)', kind: 'screen', stage: 2, lane: 'analyse', subOf: 'periode' },
    { id: 'zoeken', scenarioId: 'UAT-CASH-10', label: 'WF-CASH-10 · Transacties zoeken/filteren in de tijdlijn', kind: 'screen', stage: 2, lane: 'analyse' },

    // ── 3 · transactiebeheer ──────────────────────────────────────────────
    { id: 'toevoegen', scenarioId: 'UAT-CASH-11', label: 'WF-CASH-11 · Handmatig transactie toevoegen', kind: 'action', stage: 3, lane: 'transacties' },
    { id: 'bewerken', scenarioId: 'UAT-CASH-12', label: 'WF-CASH-12 · Bewerken & hercategoriseren (reikwijdte)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'toevoegen' },
    { id: 'splitsen', scenarioId: 'UAT-CASH-13', label: 'WF-CASH-13 · Splitsen over meerdere budgetten', kind: 'action', stage: 3, lane: 'transacties', subOf: 'toevoegen' },
    { id: 'verwijderen', scenarioId: 'UAT-CASH-14', label: 'WF-CASH-14 · Transactie verwijderen', kind: 'action', stage: 3, lane: 'transacties', subOf: 'toevoegen' },
    { id: 'tegenpartij', scenarioId: 'UAT-CASH-15', label: 'WF-CASH-15 · Tegenpartij analyseren', kind: 'screen', stage: 3, lane: 'transacties' },

    // ── 4 · vaste lasten ──────────────────────────────────────────────────
    { id: 'vastelasten', scenarioId: 'UAT-CASH-16', label: 'WF-CASH-16 · Vaste lasten: totaal/aandeel/vrijheidstijd', kind: 'screen', stage: 4, lane: 'vastelasten' },
    { id: 'classificeren', scenarioId: 'UAT-CASH-17', label: 'WF-CASH-17 · Terugkerend item classificeren/bevestigen', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'opzeggen', scenarioId: 'UAT-CASH-18', label: 'WF-CASH-18 · Abonnement opzeggen (opzegbrief)', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'aianalyse', scenarioId: 'UAT-CASH-19', label: 'WF-CASH-19 · Vaste kosten laten analyseren door Will (AI)', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'watals', scenarioId: 'UAT-CASH-20', label: 'WF-CASH-20 · "Wat als ik opzeg"-schuif', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'kalender', scenarioId: 'UAT-CASH-21', label: 'WF-CASH-21 · Cashflow-kalender (5 weken)', kind: 'screen', stage: 4, lane: 'vastelasten' },
    { id: 'forecast', scenarioId: 'UAT-CASH-22', label: 'WF-CASH-22 · Cashflow-forecast (6 maanden)', kind: 'screen', stage: 4, lane: 'vastelasten' },
    { id: 'regelbeheer', scenarioId: 'UAT-CASH-31', label: 'WF-CASH-31 · Terugkerende regels beheren/stopzetten/verwijderen', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },

    // ── 5 · bankimport ────────────────────────────────────────────────────
    { id: 'importbeslis', label: 'Bankbestand-formaat (MT940/OFX/CSV) of open banking?', kind: 'decision', stage: 5 },
    { id: 'mt940', scenarioId: 'UAT-CASH-23', label: 'WF-CASH-23 · MT940/OFX importeren', kind: 'action', stage: 5, lane: 'import' },
    { id: 'csv', scenarioId: 'UAT-CASH-24', label: 'WF-CASH-24 · CSV importeren (preset + kolom-toewijzing)', kind: 'action', stage: 5, lane: 'import' },
    { id: 'aicat', scenarioId: 'UAT-CASH-25', label: 'WF-CASH-25 · AI-categorisering ("Vraag Will")', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'handmatigcat', scenarioId: 'UAT-CASH-26', label: 'WF-CASH-26 · Handmatig categoriseren (bulk + regels onthouden)', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'eigenrekening', scenarioId: 'UAT-CASH-27', label: 'WF-CASH-27 · Eigen-overboekingen herkennen/markeren', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'sleepmodus', scenarioId: 'UAT-CASH-28', label: 'WF-CASH-28 · Sleepmodus (drag-and-drop categoriseren)', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'importfout', scenarioId: 'UAT-CASH-29', label: 'WF-CASH-29 · Import-foutherstel (netwerk/batches/sessie)', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'bankkoppelen', scenarioId: 'UAT-CASH-30', label: 'WF-CASH-30 · Bank koppelen via open banking + eerste sync', kind: 'action', stage: 5, lane: 'import' },

    // ── 6 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Transacties/budgetten/vaste lasten/forecast bijgewerkt', kind: 'outcome', stage: 6 },

    // ── 7 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-budget', label: 'Budgetteren · besteding per categorie', kind: 'cross', stage: 7, crossZone: 'BUDGET' },
    { id: 'x-ovz', label: 'Overzicht · netto vermogen, gezondheidsscore, sidebar-status-dots', kind: 'cross', stage: 7, crossZone: 'OVZ' },
    { id: 'x-toek', label: 'Toekomst · spaarquote/inkomen-bron voor de FIRE-projectie', kind: 'cross', stage: 7, crossZone: 'TOEK' },
    { id: 'x-will', label: 'Will · "Bespreek met Will" bij vaste lasten', kind: 'cross', stage: 7, crossZone: 'WILL' },
    { id: 'x-bezit', label: 'Bezittingen · cash-asset herwaarderen/AssetPane', kind: 'cross', stage: 7, crossZone: 'BEZIT' },
    { id: 'x-mijn', label: 'Mijn · gekoppelde rekeningen in /mijn/koppelingen', kind: 'cross', stage: 7, crossZone: 'MIJN' },
  ],
  edges: [
    // landing
    { from: 'nav', to: 'hefboom' },
    { from: 'hefboom', to: 'geldstroom' },
    { from: 'geldstroom', to: 'kassabon' },
    { from: 'hefboom', to: 'rekeningen' },
    { from: 'hefboom', to: 'instellingen' },
    { from: 'hefboom', to: 'inflatie' },
    { from: 'hefboom', to: 'statusmelding' },

    // analyse
    { from: 'hefboom', to: 'periode' },
    { from: 'periode', to: 'inzichten' },
    { from: 'inzichten', to: 'zoeken' },

    // transactiebeheer
    { from: 'zoeken', to: 'toevoegen' },
    { from: 'toevoegen', to: 'bewerken' },
    { from: 'toevoegen', to: 'splitsen' },
    { from: 'toevoegen', to: 'verwijderen' },
    { from: 'inzichten', to: 'tegenpartij' },

    // vaste lasten
    { from: 'hefboom', to: 'vastelasten' },
    { from: 'vastelasten', to: 'classificeren' },
    { from: 'classificeren', to: 'opzeggen' },
    { from: 'vastelasten', to: 'aianalyse' },
    { from: 'vastelasten', to: 'watals' },
    { from: 'vastelasten', to: 'kalender' },
    { from: 'vastelasten', to: 'forecast' },
    { from: 'vastelasten', to: 'regelbeheer' },
    { from: 'opzeggen', to: 'x-will', kind: 'cross', label: 'actielijst' },

    // bankimport
    { from: 'toevoegen', to: 'importbeslis' },
    { from: 'importbeslis', to: 'mt940', kind: 'branch', label: 'MT940/OFX' },
    { from: 'importbeslis', to: 'csv', kind: 'branch', label: 'CSV' },
    { from: 'importbeslis', to: 'bankkoppelen', kind: 'branch', label: 'open banking' },
    { from: 'mt940', to: 'aicat' },
    { from: 'mt940', to: 'handmatigcat' },
    { from: 'mt940', to: 'eigenrekening' },
    { from: 'mt940', to: 'sleepmodus' },
    { from: 'mt940', to: 'importfout' },
    { from: 'csv', to: 'aicat' },
    { from: 'bankkoppelen', to: 'x-mijn', kind: 'cross' },

    // samenvloeien → uitkomst
    { from: 'bewerken', to: 'uitkomst' },
    { from: 'splitsen', to: 'uitkomst' },
    { from: 'verwijderen', to: 'uitkomst' },
    { from: 'tegenpartij', to: 'uitkomst' },
    { from: 'opzeggen', to: 'uitkomst' },
    { from: 'aianalyse', to: 'uitkomst' },
    { from: 'watals', to: 'uitkomst' },
    { from: 'kalender', to: 'uitkomst' },
    { from: 'forecast', to: 'uitkomst' },
    { from: 'regelbeheer', to: 'uitkomst' },
    { from: 'aicat', to: 'uitkomst' },
    { from: 'handmatigcat', to: 'uitkomst' },
    { from: 'eigenrekening', to: 'uitkomst' },
    { from: 'sleepmodus', to: 'uitkomst' },
    { from: 'importfout', to: 'uitkomst' },
    { from: 'bankkoppelen', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-budget', kind: 'cross' },
    { from: 'uitkomst', to: 'x-ovz', kind: 'cross' },
    { from: 'uitkomst', to: 'x-toek', kind: 'cross' },
    { from: 'uitkomst', to: 'x-bezit', kind: 'cross' },
  ],
}

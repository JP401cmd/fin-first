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
// WF-CASH-01..32 hebben een eigen UAT-scenario en dus een eigen knoop
// hieronder (drie daarvan — UAT-CASH-25/26/28 — dragen de WF-code in hun naam
// i.p.v. het `wf`-veld, zie cash.engine.test.ts-normalisatie). WF-CASH-32
// ("Vraag Fin"-wizard: bulk-kaart + groepskeuzes + verliesvrij stoppen,
// feature #881) is een latere dekkingscontrole-toevoeging, net als WF-CASH-31.
// WF-CASH-52 (betaalrekening verwijderen, ADR 0082) is de nieuwste
// dekkingscontrole-toevoeging, dezelfde soort achteraf-uitbreiding als
// WF-CASH-31/32/33..51 hierboven. WF-CASH-53/54 (grenzenpotten fase 2-5,
// ADR 0089/0092: kwartaal/jaar-periodes, prestatieweergave, widget,
// match-preview, alias, meldingen) zijn de nieuwste toevoeging.
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
// volledig pure en 'exact' — de kern van deze zone. AI (Vraag Fin/analyse)
// en de TrueLayer-koppeling zijn 'ui-only' resp. BLOCKED (sandbox vereist).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const CASH_FLOW: UatFlow = {
  zone: 'CASH',
  nodes: [
    // ── 0 · landing ───────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar /overzicht/budget', kind: 'entry', stage: 0 },
    { id: 'hefboom', scenarioId: 'UAT-CASH-01', label: 'WF-CASH-01 · Vier hefboom-kaarten (Budget/Transacties/Vaste lasten/Forecast)', kind: 'screen', stage: 0, lane: 'landing' },
    { id: 'kpiweergave', scenarioId: 'UAT-CASH-51', label: 'WF-CASH-51 · Budget-KPI resterend, Transacties-KPI gerealiseerde maand', kind: 'screen', stage: 0, lane: 'landing', subOf: 'hefboom' },

    // ── 1 · verkennen ─────────────────────────────────────────────────────
    { id: 'geldstroom', scenarioId: 'UAT-CASH-02', label: 'WF-CASH-02 · Maand-geldstroom bekijken', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'kassabon', scenarioId: 'UAT-CASH-03', label: 'WF-CASH-03 · Kassabon inkomsten/uitgaven', kind: 'screen', stage: 1, lane: 'verkennen', subOf: 'geldstroom' },
    { id: 'rekeningen', scenarioId: 'UAT-CASH-04', label: 'WF-CASH-04 · Rekeningen & rekeningdetail', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'instellingen', scenarioId: 'UAT-CASH-05', label: 'WF-CASH-05 · Cashflow-instellingen (inkomen/spaarquote/uitgaven)', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'grondslagkeuze', scenarioId: 'UAT-CASH-60', label: 'WF-CASH-60 · Grondslag inkomen/uitgaven kiezen: budgetten, transacties of eigen bedrag (ADR 0103)', kind: 'action', stage: 1, lane: 'verkennen', subOf: 'instellingen' },
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
    { id: 'rekeningverwijderen', scenarioId: 'UAT-CASH-52', label: 'WF-CASH-52 · Betaalrekening verwijderen (bewaren/verwijderen, ADR 0082)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'rekeningen' },
    { id: 'rekeningzichtbaarheid', scenarioId: 'UAT-CASH-63', label: 'WF-CASH-63 · Rekening-zichtbaarheid voor de partner (none/balance/full, ADR 0118)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'rekeningen' },
    { id: 'tebespreken', scenarioId: 'UAT-CASH-65', label: 'WF-CASH-65 · Gedeelde boeking markeren als "Te bespreken" met je partner (ADR 0128)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'toevoegen' },
    { id: 'grenzenpotberekenen', scenarioId: 'UAT-CASH-53', label: 'WF-CASH-53 · Grenzenpot berekenen en reeks (kwartaal/jaar-periodes, trend, isNearLimit)', kind: 'action', stage: 3, lane: 'transacties' },
    { id: 'grenzenpotbeheren', scenarioId: 'UAT-CASH-54', label: 'WF-CASH-54 · Grenzenpot beheren, prestatieweergave, widget, match-preview & alias (budget-regel: zie de BUDGET-kruisverwijzing)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'grenzenpotberekenen' },
    { id: 'grenzenpotscore', scenarioId: 'UAT-CASH-61', label: 'WF-CASH-61 · Grenzenpot: reeksscore en prestatiebadge over afgesloten periodes', kind: 'action', stage: 3, lane: 'transacties', subOf: 'grenzenpotberekenen' },
    { id: 'grenzenpottempo', scenarioId: 'UAT-CASH-64', label: 'WF-CASH-64 · Grenzenpot-tempo: verstreken periode en prognosebedrag (ADR 0119)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'grenzenpotberekenen' },
    { id: 'bulkzoeken', scenarioId: 'UAT-CASH-55', label: 'WF-CASH-55 · Bulkbewerken: zoeken zonder datumvenster, pagina/alle-N selecteren, impact (ADR 0104)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'zoeken' },
    { id: 'bulkhercategoriseren', scenarioId: 'UAT-CASH-56', label: 'WF-CASH-56 · Bulkbewerken: hercategoriseren — canoniek trio, split-uitsluiting', kind: 'action', stage: 3, lane: 'transacties', subOf: 'bulkzoeken' },
    { id: 'bulkverwijderen', scenarioId: 'UAT-CASH-57', label: 'WF-CASH-57 · Bulkbewerken: verwijderen — zware bevestiging, herimport-waarschuwing', kind: 'action', stage: 3, lane: 'transacties', subOf: 'bulkzoeken' },
    { id: 'bulkscoping', scenarioId: 'UAT-CASH-58', label: 'WF-CASH-58 · Bulkbewerken: huishoud-scoping en de 5.000-grens (handmatige controle)', kind: 'action', stage: 3, lane: 'transacties', subOf: 'bulkzoeken' },
    { id: 'bulkregelfeedback', scenarioId: 'UAT-CASH-59', label: 'WF-CASH-59 · Bulkbewerken: regelaanbod op bevestiging, eerlijke terugkoppeling bij gedeeltelijke mislukking', kind: 'action', stage: 3, lane: 'transacties', subOf: 'bulkhercategoriseren' },

    // ── 4 · vaste lasten ──────────────────────────────────────────────────
    { id: 'vastelasten', scenarioId: 'UAT-CASH-16', label: 'WF-CASH-16 · Vaste lasten: totaal/aandeel/vrijheidstijd', kind: 'screen', stage: 4, lane: 'vastelasten' },
    { id: 'classificeren', scenarioId: 'UAT-CASH-17', label: 'WF-CASH-17 · Terugkerend item classificeren/bevestigen', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'opzeggen', scenarioId: 'UAT-CASH-18', label: 'WF-CASH-18 · Abonnement opzeggen (opzegbrief)', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'aianalyse', scenarioId: 'UAT-CASH-19', label: 'WF-CASH-19 · Vaste kosten laten analyseren door Fin (AI)', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'watals', scenarioId: 'UAT-CASH-20', label: 'WF-CASH-20 · "Wat als ik opzeg"-schuif', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },
    { id: 'kalender', scenarioId: 'UAT-CASH-21', label: 'WF-CASH-21 · Cashflow-kalender (5 weken)', kind: 'screen', stage: 4, lane: 'vastelasten' },
    { id: 'forecast', scenarioId: 'UAT-CASH-22', label: 'WF-CASH-22 · Cashflow-forecast (6 maanden)', kind: 'screen', stage: 4, lane: 'vastelasten' },
    { id: 'regelbeheer', scenarioId: 'UAT-CASH-31', label: 'WF-CASH-31 · Terugkerende regels beheren/stopzetten/verwijderen', kind: 'action', stage: 4, lane: 'vastelasten', subOf: 'vastelasten' },

    // ── 5 · bankimport ────────────────────────────────────────────────────
    { id: 'importbeslis', label: 'Bankbestand-formaat (MT940/OFX/CSV) of open banking?', kind: 'decision', stage: 5 },
    { id: 'mt940', scenarioId: 'UAT-CASH-23', label: 'WF-CASH-23 · MT940/OFX importeren', kind: 'action', stage: 5, lane: 'import' },
    { id: 'csv', scenarioId: 'UAT-CASH-24', label: 'WF-CASH-24 · CSV importeren (preset + kolom-toewijzing)', kind: 'action', stage: 5, lane: 'import' },
    { id: 'aicat', scenarioId: 'UAT-CASH-25', label: 'WF-CASH-25 · AI-categorisering ("Vraag Fin"-wizard, groepsvolgorde)', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'aiwizard', scenarioId: 'UAT-CASH-32', label: 'WF-CASH-32 · Wizard: bulk-kaart, groepskeuzes en verliesvrij stoppen', kind: 'action', stage: 5, lane: 'import', subOf: 'aicat' },
    { id: 'handmatigcat', scenarioId: 'UAT-CASH-26', label: 'WF-CASH-26 · Handmatig categoriseren (bulk + regels onthouden)', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'eigenrekening', scenarioId: 'UAT-CASH-27', label: 'WF-CASH-27 · Eigen-overboekingen herkennen/markeren', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'sleepmodus', scenarioId: 'UAT-CASH-28', label: 'WF-CASH-28 · Sleepmodus (drag-and-drop categoriseren)', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'importfout', scenarioId: 'UAT-CASH-29', label: 'WF-CASH-29 · Import-foutherstel (netwerk/batches/sessie)', kind: 'action', stage: 5, lane: 'import', subOf: 'mt940' },
    { id: 'bankkoppelen', scenarioId: 'UAT-CASH-30', label: 'WF-CASH-30 · Bank koppelen: doelrekening kiezen (wizardstap 2) + eerste sync', kind: 'action', stage: 5, lane: 'import' },
    { id: 'doelrekeningonboarding', scenarioId: 'UAT-CASH-44', label: 'WF-CASH-44 · Doelrekening kiezen tijdens onboarding (nul kandidaten)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'saldoeerstekoppeling', scenarioId: 'UAT-CASH-39', label: 'WF-CASH-39 · Saldo ook bij eerste koppeling opgehaald', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'tegenpartijmeta', scenarioId: 'UAT-CASH-38', label: 'WF-CASH-38 · Tegenpartij uit meta.counter_party_* (Rabobank/xs2a)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'dedupscope', scenarioId: 'UAT-CASH-40', label: 'WF-CASH-40 · Duplicaatcontrole rekening-gescoped', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'dedupenof', scenarioId: 'UAT-CASH-66', label: 'WF-CASH-66 · Sync stempelt ownership + ontdubbelt tegen de partner op een en/of-rekening', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'herautorisatie', scenarioId: 'UAT-CASH-37', label: 'WF-CASH-37 · Herautorisatie na 90 dagen (hergebruik via external_account_id)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'ratelimit', scenarioId: 'UAT-CASH-35', label: 'WF-CASH-35 · Sync-rate-limit (10/dag)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'legesync', scenarioId: 'UAT-CASH-36', label: 'WF-CASH-36 · Sync zonder nieuwe transacties', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'verbreken', scenarioId: 'UAT-CASH-33', label: 'WF-CASH-33 · Verbinding verbreken (zachte ontkoppeling)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'dedupbudget', scenarioId: 'UAT-CASH-34', label: 'WF-CASH-34 · Budget-toewijzingen blijven staan bij dedup', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'budgetterenuit', scenarioId: 'UAT-CASH-41', label: 'WF-CASH-41 · Budgetteren uitschakelen behoudt rekening/koppeling', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'eersteophaal', scenarioId: 'UAT-CASH-42', label: 'WF-CASH-42 · Eerste ophaal: max. historie in blokken (B8) / D−3-startpunt (B9)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'providerlimiet', scenarioId: 'UAT-CASH-43', label: 'WF-CASH-43 · Bank-eigen verzoeklimiet kapt eerste ophaal netjes af', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'precedentieketen', scenarioId: 'UAT-CASH-45', label: 'WF-CASH-45 · Callback-precedentieketen (identiteit > keuze > IBAN > aanmaken)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'rekeningtypebank', scenarioId: 'UAT-CASH-46', label: 'WF-CASH-46 · Rekeningtype van de bank overnemen (spaar/creditcard)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'correctiemoment', scenarioId: 'UAT-CASH-47', label: 'WF-CASH-47 · Correctiemoment: dragende rekening zien en verhangen vóór de eerste sync', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'eenactievekoppelingperrekening', scenarioId: 'UAT-CASH-48', label: 'WF-CASH-48 · FR5: bezette rekening zichtbaar-maar-uitgeschakeld, 409 op de route', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'koppelgezondheidherstel', scenarioId: 'UAT-CASH-49', label: 'WF-CASH-49 · Koppelgezondheid: derde icoon-toestand, herstelpad vanaf de rekening, SC-13-herstel (beide assen)', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },
    { id: 'saldoherwaarderingspad', scenarioId: 'UAT-CASH-50', label: 'WF-CASH-50 · Saldo via het herwaarderingspad: valuations-rij + snapshot-mirror, compensatie bij relink', kind: 'action', stage: 5, lane: 'import', subOf: 'bankkoppelen' },

    // ── 6 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Transacties/budgetten/vaste lasten/forecast bijgewerkt', kind: 'outcome', stage: 6 },

    // ── 7 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-budget', label: 'Budgetteren · besteding per categorie', kind: 'cross', stage: 7, crossZone: 'BUDGET' },
    { id: 'x-ovz', label: 'Overzicht · netto vermogen, gezondheidsscore, sidebar-status-dots', kind: 'cross', stage: 7, crossZone: 'OVZ' },
    { id: 'x-toek', label: 'Toekomst · spaarquote/inkomen-bron voor de FIRE-projectie', kind: 'cross', stage: 7, crossZone: 'TOEK' },
    { id: 'x-will', label: 'Fin · "Bespreek met Fin" bij vaste lasten', kind: 'cross', stage: 7, crossZone: 'WILL' },
    { id: 'x-bezit', label: 'Bezittingen · cash-asset herwaarderen/AssetPane', kind: 'cross', stage: 7, crossZone: 'BEZIT' },
    { id: 'x-mijn', label: 'Mijn · gekoppelde rekeningen in /mijn/koppelingen', kind: 'cross', stage: 7, crossZone: 'MIJN' },
  ],
  edges: [
    // landing
    { from: 'nav', to: 'hefboom' },
    { from: 'hefboom', to: 'kpiweergave' },
    { from: 'hefboom', to: 'geldstroom' },
    { from: 'geldstroom', to: 'kassabon' },
    { from: 'hefboom', to: 'rekeningen' },
    { from: 'hefboom', to: 'instellingen' },
    { from: 'instellingen', to: 'grondslagkeuze' },
    { from: 'grondslagkeuze', to: 'x-budget', kind: 'cross', label: 'budgetgrondslag' },
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
    { from: 'rekeningen', to: 'rekeningverwijderen' },
    { from: 'rekeningen', to: 'rekeningzichtbaarheid' },
    { from: 'hefboom', to: 'grenzenpotberekenen' },
    { from: 'grenzenpotberekenen', to: 'grenzenpotbeheren' },
    { from: 'grenzenpotberekenen', to: 'grenzenpotscore' },
    { from: 'grenzenpotberekenen', to: 'grenzenpottempo' },
    { from: 'grenzenpotbeheren', to: 'x-will', kind: 'cross', label: 'melding' },
    { from: 'zoeken', to: 'bulkzoeken' },
    { from: 'bulkzoeken', to: 'bulkhercategoriseren' },
    { from: 'bulkzoeken', to: 'bulkverwijderen' },
    { from: 'bulkzoeken', to: 'bulkscoping' },
    { from: 'bulkhercategoriseren', to: 'bulkregelfeedback' },
    { from: 'bulkverwijderen', to: 'bulkregelfeedback' },

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
    { from: 'aicat', to: 'aiwizard' },
    { from: 'mt940', to: 'handmatigcat' },
    { from: 'mt940', to: 'eigenrekening' },
    { from: 'mt940', to: 'sleepmodus' },
    { from: 'mt940', to: 'importfout' },
    { from: 'csv', to: 'aicat' },
    { from: 'bankkoppelen', to: 'x-mijn', kind: 'cross' },
    { from: 'bankkoppelen', to: 'doelrekeningonboarding' },
    { from: 'bankkoppelen', to: 'saldoeerstekoppeling' },
    { from: 'bankkoppelen', to: 'tegenpartijmeta' },
    { from: 'bankkoppelen', to: 'dedupscope' },
    { from: 'bankkoppelen', to: 'herautorisatie' },
    { from: 'bankkoppelen', to: 'ratelimit' },
    { from: 'bankkoppelen', to: 'legesync' },
    { from: 'bankkoppelen', to: 'verbreken' },
    { from: 'bankkoppelen', to: 'dedupbudget' },
    { from: 'bankkoppelen', to: 'budgetterenuit' },
    { from: 'bankkoppelen', to: 'eersteophaal' },
    { from: 'eersteophaal', to: 'providerlimiet' },
    { from: 'bankkoppelen', to: 'precedentieketen' },
    { from: 'bankkoppelen', to: 'rekeningtypebank' },
    { from: 'precedentieketen', to: 'correctiemoment' },

    // samenvloeien → uitkomst
    { from: 'kpiweergave', to: 'uitkomst' },
    { from: 'bewerken', to: 'uitkomst' },
    { from: 'splitsen', to: 'uitkomst' },
    { from: 'verwijderen', to: 'uitkomst' },
    { from: 'tegenpartij', to: 'uitkomst' },
    { from: 'rekeningverwijderen', to: 'uitkomst' },
    { from: 'rekeningzichtbaarheid', to: 'uitkomst' },
    { from: 'grenzenpotberekenen', to: 'uitkomst' },
    { from: 'grenzenpotbeheren', to: 'uitkomst' },
    { from: 'grenzenpotscore', to: 'uitkomst' },
    { from: 'grenzenpottempo', to: 'uitkomst' },
    { from: 'grondslagkeuze', to: 'uitkomst' },
    { from: 'bulkzoeken', to: 'uitkomst' },
    { from: 'bulkhercategoriseren', to: 'uitkomst' },
    { from: 'bulkverwijderen', to: 'uitkomst' },
    { from: 'bulkscoping', to: 'uitkomst' },
    { from: 'bulkregelfeedback', to: 'uitkomst' },
    { from: 'opzeggen', to: 'uitkomst' },
    { from: 'aianalyse', to: 'uitkomst' },
    { from: 'watals', to: 'uitkomst' },
    { from: 'kalender', to: 'uitkomst' },
    { from: 'forecast', to: 'uitkomst' },
    { from: 'regelbeheer', to: 'uitkomst' },
    { from: 'aicat', to: 'uitkomst' },
    { from: 'aiwizard', to: 'uitkomst' },
    { from: 'handmatigcat', to: 'uitkomst' },
    { from: 'eigenrekening', to: 'uitkomst' },
    { from: 'sleepmodus', to: 'uitkomst' },
    { from: 'importfout', to: 'uitkomst' },
    { from: 'bankkoppelen', to: 'uitkomst' },
    { from: 'doelrekeningonboarding', to: 'uitkomst' },
    { from: 'saldoeerstekoppeling', to: 'uitkomst' },
    { from: 'tegenpartijmeta', to: 'uitkomst' },
    { from: 'dedupscope', to: 'uitkomst' },
    { from: 'herautorisatie', to: 'uitkomst' },
    { from: 'ratelimit', to: 'uitkomst' },
    { from: 'legesync', to: 'uitkomst' },
    { from: 'verbreken', to: 'uitkomst' },
    { from: 'dedupbudget', to: 'uitkomst' },
    { from: 'budgetterenuit', to: 'uitkomst' },
    { from: 'eersteophaal', to: 'uitkomst' },
    { from: 'providerlimiet', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-budget', kind: 'cross' },
    { from: 'uitkomst', to: 'x-ovz', kind: 'cross' },
    { from: 'uitkomst', to: 'x-toek', kind: 'cross' },
    { from: 'uitkomst', to: 'x-bezit', kind: 'cross' },
  ],
}

// Gecureerde Toekomst-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Toekomst & tijdas (WF-TOEK)"
// (WF-TOEK-01..26,28,29,30,32) en de acceptatie in lib/uat/acceptance/toek.ts.
// De knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-TOEK-NN) en erven daarmee de rondestatus. Het label
// toont bewust het WF-nummer, spiegelt lib/uat/flows/bezit.ts.
//
// Het proces leest links→rechts: instap → tijdas-hub → de grafiek aflezen →
// de projectie simuleren & gebeurtenissen plaatsen → de toekomst configureren
// (levens-/werk-/huis-strategie, voorkeuren, doelen) → uitkomst (FIRE-cijfers)
// → cross-doorwerking. WF-TOEK-27 (uitgave-na-pensioen) en WF-TOEK-31
// (huishoud-/partnerperspectief) hebben BEWUST geen eigen scenario: het zijn
// verwijsregels naar REKEN resp. NAV (zie lib/uat/acceptance/toek.ts) en horen
// daar getoetst te worden — ze komen hier daarom niet voor.
//
// GRONDSLAG-REGEL (CLAUDE.md): `nettoVermogen` (incl. niet-liquide, bv. de
// eigen woning) is een ANDERE grootheid dan de liquide/FIRE-eligible
// portefeuille die de kernel als grondslag voor benodigd/belegbaar vermogen
// gebruikt. De cross-knopen houden die twee uit elkaar: `x-bezit` = liquide/
// FIRE-eligible grondslag (INPUT voor de kernel); `x-ovz` = netto vermogen +
// FIRE-countdown op de Overzicht-hero (OUTPUT-doorwerking).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const TOEK_FLOW: UatFlow = {
  zone: 'TOEK',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar Toekomst (/toekomst)', kind: 'entry', stage: 0 },
    { id: 'eerste', label: 'Eerste keer?', kind: 'decision', stage: 0 },
    { id: 'welkom', scenarioId: 'UAT-TOEK-07', label: 'WF-TOEK-07 · Welkomst & Tips-modus', kind: 'screen', stage: 0, lane: 'instap' },

    // ── 0 · grondslag (kernel-inputs uit andere domeinen) ─────────────────
    { id: 'x-bezit', label: 'Liquide / FIRE-eligible portefeuille (grondslag)', kind: 'cross', stage: 0, lane: 'grondslag', crossZone: 'BEZIT' },
    { id: 'x-belast', label: 'Box 3-forfait (nettorendement)', kind: 'cross', stage: 0, lane: 'grondslag', crossZone: 'BELAST' },

    // ── 1 · tijdas-hub ────────────────────────────────────────────────────
    { id: 'tijdas', scenarioId: 'UAT-TOEK-01', label: 'WF-TOEK-01 · Tijdas-landing & FIRE-kerncijfers', kind: 'screen', stage: 1 },

    // ── 2 · de grafiek aflezen ────────────────────────────────────────────
    { id: 'kpi', scenarioId: 'UAT-TOEK-02', label: 'WF-TOEK-02 · KPI-kassabon controleren', kind: 'screen', stage: 2, lane: 'aflezen' },
    { id: 'status', scenarioId: 'UAT-TOEK-03', label: 'WF-TOEK-03 · Statusmeldingen boven de grafiek', kind: 'screen', stage: 2, lane: 'aflezen' },
    { id: 'grafiek', scenarioId: 'UAT-TOEK-04', label: 'WF-TOEK-04 · Grafiek verkennen (Pad/Opbouw, zoom)', kind: 'screen', stage: 2, lane: 'aflezen' },
    { id: 'jaardetail', scenarioId: 'UAT-TOEK-05', label: 'WF-TOEK-05 · Jaar-detail-kassabon', kind: 'screen', stage: 2, lane: 'aflezen', subOf: 'grafiek' },
    { id: 'details', scenarioId: 'UAT-TOEK-06', label: 'WF-TOEK-06 · "Details" · jaar-op-jaar tabel', kind: 'screen', stage: 2, lane: 'aflezen', subOf: 'grafiek' },
    { id: 'fasebalk', scenarioId: 'UAT-TOEK-12', label: 'WF-TOEK-12 · Fase-balk (drie levensfasen)', kind: 'screen', stage: 2, lane: 'aflezen' },
    { id: 'markers', scenarioId: 'UAT-TOEK-16', label: 'WF-TOEK-16 · Markers & natuurlijke mijlpalen', kind: 'screen', stage: 2, lane: 'aflezen' },
    { id: 'verdieping', scenarioId: 'UAT-TOEK-32', label: 'WF-TOEK-32 · Verdieping: trends & geplande acties', kind: 'screen', stage: 2, lane: 'aflezen' },
    { id: 'euroweergave', scenarioId: 'UAT-TOEK-33', label: "WF-TOEK-33 · Huidige euro's: grafiek/hero/fasetabel", kind: 'action', stage: 2, lane: 'aflezen', subOf: 'grafiek' },
    { id: 'maskering', scenarioId: 'UAT-TOEK-34', label: 'WF-TOEK-34 · Bedragmaskering op de grafiek', kind: 'action', stage: 2, lane: 'aflezen', subOf: 'grafiek' },
    { id: 'grondslaglijn', scenarioId: 'UAT-TOEK-36', label: 'WF-TOEK-36 · Grondslag hoofdlijn per woonstrategie', kind: 'screen', stage: 2, lane: 'aflezen', subOf: 'grafiek' },
    { id: 'grondslagdoorwerking', scenarioId: 'UAT-TOEK-37', label: 'WF-TOEK-37 · Stip, band, drempels, pill & kassabon bewegen mee', kind: 'screen', stage: 2, lane: 'aflezen', subOf: 'grondslaglijn' },

    // ── 2 · navigeren & delen ─────────────────────────────────────────────
    { id: 'navkaarten', scenarioId: 'UAT-TOEK-28', label: 'WF-TOEK-28 · Navigatiekaarten (drilldown)', kind: 'screen', stage: 2, lane: 'navigeren' },
    { id: 'deeplinks', scenarioId: 'UAT-TOEK-30', label: 'WF-TOEK-30 · Deeplinks & legacy-routes', kind: 'screen', stage: 2, lane: 'navigeren', subOf: 'navkaarten' },
    { id: 'delen', scenarioId: 'UAT-TOEK-29', label: 'WF-TOEK-29 · Delen / afdrukken (PDF)', kind: 'action', stage: 2, lane: 'navigeren' },

    // ── 3 · simuleren (niet-persistent over de grafiek) ───────────────────
    { id: 'scenarios', scenarioId: 'UAT-TOEK-08', label: "WF-TOEK-08 · Scenario's & Monte Carlo", kind: 'action', stage: 3, lane: 'simuleren' },
    { id: 'ghost', scenarioId: 'UAT-TOEK-09', label: 'WF-TOEK-09 · Opgeslagen wat-als (spooklijn)', kind: 'action', stage: 3, lane: 'simuleren' },
    { id: 'sliders', scenarioId: 'UAT-TOEK-10', label: 'WF-TOEK-10 · Wat-als-sliders inline', kind: 'action', stage: 3, lane: 'simuleren' },
    { id: 'aowbeslis', label: 'Shortfall — FIRE pas ná AOW?', kind: 'decision', stage: 3, lane: 'simuleren' },
    { id: 'aowstop', scenarioId: 'UAT-TOEK-11', label: 'WF-TOEK-11 · AOW-stop-simulatie (doorwerken)', kind: 'action', stage: 3, lane: 'simuleren', subOf: 'aowbeslis' },

    // ── 3 · gebeurtenissen op de tijdas ───────────────────────────────────
    { id: 'eventadd', scenarioId: 'UAT-TOEK-13', label: 'WF-TOEK-13 · Levensgebeurtenis toevoegen', kind: 'action', stage: 3, lane: 'gebeurtenissen' },
    { id: 'eventedit', scenarioId: 'UAT-TOEK-14', label: 'WF-TOEK-14 · Bekijken / bewerken / verwijderen', kind: 'screen', stage: 3, lane: 'gebeurtenissen', subOf: 'eventadd' },
    { id: 'eventdrag', scenarioId: 'UAT-TOEK-15', label: 'WF-TOEK-15 · Slepen op de tijdas & undo', kind: 'action', stage: 3, lane: 'gebeurtenissen', subOf: 'eventadd' },
    { id: 'eventpagina', scenarioId: 'UAT-TOEK-17', label: 'WF-TOEK-17 · Gebeurtenissen-pagina (kernel-momenten)', kind: 'screen', stage: 3, lane: 'gebeurtenissen' },
    { id: 'tekortbeslis', label: 'Tekort in de projectie?', kind: 'decision', stage: 3, lane: 'gebeurtenissen', subOf: 'eventpagina' },
    { id: 'risicoevents', scenarioId: 'UAT-TOEK-38', label: 'WF-TOEK-38 · Risico-events: werkloosheid & overlijden partner (WW/Anw)', kind: 'action', stage: 3, lane: 'gebeurtenissen', subOf: 'eventadd' },

    // ── 4 · de toekomst configureren · levens-/werk-/huis-strategie ───────
    { id: 'strategiebeslis', label: 'Welke levensgebeurtenis?', kind: 'decision', stage: 4, lane: 'strategie' },
    { id: 'aowstrat', scenarioId: 'UAT-TOEK-18', label: 'WF-TOEK-18 · AOW-strategie instellen', kind: 'screen', stage: 4, lane: 'strategie', subOf: 'strategiebeslis' },
    { id: 'pensioenstrat', scenarioId: 'UAT-TOEK-19', label: 'WF-TOEK-19 · Pensioen-strategie (potten & import)', kind: 'screen', stage: 4, lane: 'strategie', subOf: 'strategiebeslis' },
    { id: 'werkstrat', scenarioId: 'UAT-TOEK-20', label: 'WF-TOEK-20 · Werk-strategie (inkomenslijn)', kind: 'screen', stage: 4, lane: 'strategie', subOf: 'strategiebeslis' },
    { id: 'huisstrat', scenarioId: 'UAT-TOEK-21', label: 'WF-TOEK-21 · Huis-strategie (woning in je vrijheid)', kind: 'screen', stage: 4, lane: 'strategie', subOf: 'strategiebeslis' },
    { id: 'downsizebeslis', label: 'Meetellen / uitsluiten / verkopen?', kind: 'decision', stage: 4, lane: 'strategie', subOf: 'huisstrat' },

    // ── 4 · de toekomst configureren · voorkeuren ─────────────────────────
    { id: 'eindstrat', scenarioId: 'UAT-TOEK-24', label: 'WF-TOEK-24 · Eind-/onttrekkingsstrategie', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'potregels', scenarioId: 'UAT-TOEK-25', label: 'WF-TOEK-25 · Pot-regels (volgorde, toe-/afname)', kind: 'screen', stage: 4, lane: 'voorkeuren' },
    { id: 'marktaannames', scenarioId: 'UAT-TOEK-26', label: 'WF-TOEK-26 · Markt-aannames (inflatie, rendement)', kind: 'screen', stage: 4, lane: 'voorkeuren' },

    // ── 4 · de toekomst configureren · doelen ─────────────────────────────
    { id: 'doelen', scenarioId: 'UAT-TOEK-22', label: 'WF-TOEK-22 · Doelen bekijken & toevoegen (ETA)', kind: 'screen', stage: 4, lane: 'doelen' },
    { id: 'doelvoortgang', scenarioId: 'UAT-TOEK-23', label: 'WF-TOEK-23 · Doel-voortgang bijwerken/behalen', kind: 'screen', stage: 4, lane: 'doelen', subOf: 'doelen' },
    { id: 'doelpace', scenarioId: 'UAT-TOEK-35', label: 'WF-TOEK-35 · Pace-toets ("op koers") & live vrijheidsgetal-doel', kind: 'screen', stage: 4, lane: 'doelen', subOf: 'doelen' },

    // ── 5 · uitkomst ──────────────────────────────────────────────────────
    { id: 'fire', label: 'Toekomstbeeld bijgewerkt · vrijheidsleeftijd, FIRE-datum & doelen', kind: 'outcome', stage: 5 },

    // ── 6 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht-hero · netto vermogen + FIRE-countdown', kind: 'cross', stage: 6, crossZone: 'OVZ' },
    { id: 'x-reken', label: 'Rekenhulp / wat-als (zelfde horizon-kernel)', kind: 'cross', stage: 6, crossZone: 'REKEN' },
  ],
  edges: [
    // instap → hub
    { from: 'nav', to: 'eerste' },
    { from: 'eerste', to: 'welkom', kind: 'branch', label: 'eerste keer' },
    { from: 'eerste', to: 'tijdas', label: 'al bekend' },
    { from: 'welkom', to: 'tijdas' },

    // grondslag (INPUT) → kernel/hub
    { from: 'x-bezit', to: 'tijdas', kind: 'cross', label: 'grondslag: liquide/FIRE-eligible' },
    { from: 'x-belast', to: 'tijdas', kind: 'cross', label: 'Box 3-forfait' },

    // hub → aflezen
    { from: 'tijdas', to: 'kpi' },
    { from: 'tijdas', to: 'status' },
    { from: 'tijdas', to: 'grafiek' },
    { from: 'grafiek', to: 'jaardetail' },
    { from: 'grafiek', to: 'details' },
    { from: 'grafiek', to: 'euroweergave' },
    { from: 'grafiek', to: 'maskering' },
    { from: 'grafiek', to: 'grondslaglijn' },
    { from: 'grondslaglijn', to: 'grondslagdoorwerking' },
    { from: 'tijdas', to: 'fasebalk' },
    { from: 'tijdas', to: 'markers' },
    { from: 'tijdas', to: 'verdieping' },

    // hub → navigeren & delen
    { from: 'tijdas', to: 'navkaarten' },
    { from: 'navkaarten', to: 'deeplinks' },
    { from: 'tijdas', to: 'delen' },

    // hub → simuleren
    { from: 'tijdas', to: 'scenarios' },
    { from: 'tijdas', to: 'ghost' },
    { from: 'tijdas', to: 'sliders' },
    { from: 'tijdas', to: 'aowbeslis' },
    { from: 'aowbeslis', to: 'aowstop', kind: 'branch', label: 'ja: doorwerken tot AOW' },
    { from: 'sliders', to: 'x-reken', kind: 'cross', label: 'volledige wat-als → Rekenhulp' },

    // hub/navkaarten → gebeurtenissen
    { from: 'tijdas', to: 'eventadd' },
    { from: 'eventadd', to: 'eventedit' },
    { from: 'eventadd', to: 'eventdrag' },
    { from: 'eventadd', to: 'risicoevents' },
    { from: 'navkaarten', to: 'eventpagina', kind: 'branch', label: 'Gebeurtenissen' },
    { from: 'eventpagina', to: 'tekortbeslis' },
    { from: 'tekortbeslis', to: 'x-reken', kind: 'cross', label: 'ja: tekort-lening (kernel)' },

    // navkaarten → configureren (Voorkeuren / Doelen), strategie via markers/hub
    { from: 'tijdas', to: 'strategiebeslis' },
    { from: 'strategiebeslis', to: 'aowstrat', kind: 'branch', label: 'AOW' },
    { from: 'strategiebeslis', to: 'pensioenstrat', kind: 'branch', label: 'pensioen' },
    { from: 'strategiebeslis', to: 'werkstrat', kind: 'branch', label: 'werk' },
    { from: 'strategiebeslis', to: 'huisstrat', kind: 'branch', label: 'huis' },
    { from: 'huisstrat', to: 'downsizebeslis' },
    // De woonstrategie bepaalt de grondslag van de PRIMAIRE vermogenslijn
    // (ADR 0114 D1) — de keuze wordt hier gemaakt, op de grafiek afgelezen.
    { from: 'huisstrat', to: 'grondslaglijn', kind: 'branch', label: 'grondslag hoofdlijn (I of J)' },
    { from: 'navkaarten', to: 'eindstrat', kind: 'branch', label: 'Voorkeuren' },
    { from: 'eindstrat', to: 'potregels' },
    { from: 'eindstrat', to: 'marktaannames' },
    { from: 'navkaarten', to: 'doelen', kind: 'branch', label: 'Doelen' },
    { from: 'doelen', to: 'doelvoortgang' },
    { from: 'doelen', to: 'doelpace' },

    // samenvloeien → uitkomst
    { from: 'sliders', to: 'fire' },
    { from: 'aowstop', to: 'fire' },
    { from: 'eventadd', to: 'fire' },
    { from: 'risicoevents', to: 'fire' },
    { from: 'tekortbeslis', to: 'fire' },
    { from: 'aowstrat', to: 'fire' },
    { from: 'pensioenstrat', to: 'fire' },
    { from: 'werkstrat', to: 'fire' },
    { from: 'downsizebeslis', to: 'fire' },
    { from: 'eindstrat', to: 'fire' },
    { from: 'potregels', to: 'fire' },
    { from: 'marktaannames', to: 'fire' },
    { from: 'doelvoortgang', to: 'fire' },
    { from: 'doelpace', to: 'fire' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'fire', to: 'x-ovz', kind: 'cross' },
    { from: 'fire', to: 'x-reken', kind: 'cross' },
  ],
}

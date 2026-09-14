// Gecureerde Reken-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Rekentools (WF-REKEN)"
// (WF-REKEN-01..24) en de acceptatie in lib/uat/acceptance/reken.ts. De
// knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-REKEN-NN) en erven daarmee de rondestatus. Het
// label toont bewust het WF-nummer, spiegelt lib/uat/flows/rapp.ts +
// nav.ts + ovz.ts + cash.ts + will.ts + start.ts.
//
// VERVALLEN (14 sep 2026, ADR 0144 "De Wat-Als-pagina gaat op in de
// tijdas"): de standalone Wat-Als-pagina (/toekomst/whatif) — met haar
// deeplink/dream-gate-instap, presets, sliders, levensgebeurtenissen-in-
// scenario, beslishulp, onzekerheidsband, Fin-chat en acties-afleiding — is
// verwijderd. Daarmee vervallen de knopen voor WF-REKEN-12..16 en 18..20
// (acht stuks) en hun cross-doorwerking naar OVZ ("geen basisgegevens" —
// die lege staat leefde alléén op de nu-vervallen pagina). Het INLINE-
// slider-gedrag op de tijdas ("Verken je aannames") blijft ongewijzigd en
// zit in de TOEK-flow (WF-TOEK-10) — zie lib/uat/flows/toek.ts.
//
// REKEN is — net als SCHULD/TOEK/WILL/OVZ/NAV — NIET aaneengesloten op
// WF-nummer: WF-REKEN-17 (bewaarde wat-als-scenario's: opslaan/laden/pinnen/
// verwijderen) had al geen eigen UAT-REKEN-scenario en verviel samen met
// UAT-TOEK-09 (zie lib/uat/flows/toek.ts). De 15 overige WF-REKEN-01..11/
// 21..24 hebben elk een eigen knoop hieronder.
//
// Het proces leest links→rechts: instap (rekenhulp-lijst) → bibliotheek
// (CRUD/publiceren/dupliceren/liken/melden) → losse rekentools (inflatie/
// samengestelde interest/uitgave na pensioen) → uitkomst → cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md / zone-specifieke notitie): de rekenhulp-
// evaluator en de losse rekentools zijn een APART, gebruikersgestuurd
// sandbox-domein — losgekoppeld van de FIRE-projectie totdat een uitkomst
// expliciet als levensgebeurtenis wordt geëxporteerd (WF-REKEN-03) of als
// uitgavengrondslag wordt gekozen (WF-REKEN-23/24). De horizon-kernel wordt
// hier zelf niet meer aangeroepen (dat gebeurde alleen op de vervallen
// Wat-Als-pagina); de cross naar TOEK hieronder markeert dat beide domeinen
// wel dezelfde onderliggende kernel delen als een gebruiker een rekenhulp-
// uitkomst exporteert.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const REKEN_FLOW: UatFlow = {
  zone: 'REKEN',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'lijst', scenarioId: 'UAT-REKEN-01', label: 'WF-REKEN-01 · Opgeslagen rekenhulp openen en doorrekenen', kind: 'entry', stage: 0 },
    { id: 'nieuwmetwill', scenarioId: 'UAT-REKEN-02', label: 'WF-REKEN-02 · Nieuwe rekenhulp bouwen met Fin (AI)', kind: 'action', stage: 0, lane: 'rekenhulpen', subOf: 'lijst' },
    { id: 'naareve', scenarioId: 'UAT-REKEN-03', label: 'WF-REKEN-03 · Uitkomst omzetten in levensgebeurtenis', kind: 'action', stage: 0, lane: 'rekenhulpen', subOf: 'lijst' },
    { id: 'verwijderen', scenarioId: 'UAT-REKEN-06', label: 'WF-REKEN-06 · Rekenhulp verwijderen (geen bevestiging)', kind: 'action', stage: 0, lane: 'rekenhulpen', subOf: 'lijst' },

    // ── 1 · bibliotheek ───────────────────────────────────────────────────
    { id: 'publiceren', scenarioId: 'UAT-REKEN-04', label: 'WF-REKEN-04 · Eigen rekenhulp publiceren', kind: 'action', stage: 1, lane: 'bibliotheek' },
    { id: 'depubliceren', scenarioId: 'UAT-REKEN-05', label: 'WF-REKEN-05 · Publicatie terugtrekken', kind: 'action', stage: 1, lane: 'bibliotheek', subOf: 'publiceren' },
    { id: 'verkennen', scenarioId: 'UAT-REKEN-07', label: 'WF-REKEN-07 · Publieke bibliotheek verkennen en filteren', kind: 'screen', stage: 1, lane: 'bibliotheek' },
    { id: 'detailpreview', scenarioId: 'UAT-REKEN-08', label: 'WF-REKEN-08 · Publieke rekenhulp read-only preview', kind: 'screen', stage: 1, lane: 'bibliotheek', subOf: 'verkennen' },
    { id: 'dupliceren', scenarioId: 'UAT-REKEN-09', label: 'WF-REKEN-09 · Bibliotheek-rekenhulp dupliceren', kind: 'action', stage: 1, lane: 'bibliotheek', subOf: 'detailpreview' },
    { id: 'liken', scenarioId: 'UAT-REKEN-10', label: 'WF-REKEN-10 · Publieke rekenhulp liken/unliken', kind: 'action', stage: 1, lane: 'bibliotheek', subOf: 'detailpreview' },
    { id: 'melden', scenarioId: 'UAT-REKEN-11', label: 'WF-REKEN-11 · Publieke rekenhulp melden', kind: 'action', stage: 1, lane: 'bibliotheek', subOf: 'detailpreview' },

    // ── 2 · losse rekentools ──────────────────────────────────────────────
    { id: 'inflatie', scenarioId: 'UAT-REKEN-21', label: 'WF-REKEN-21 · Inflatie & koopkracht doorrekenen', kind: 'screen', stage: 2, lane: 'rekentools' },
    { id: 'samengesteld', scenarioId: 'UAT-REKEN-22', label: 'WF-REKEN-22 · Samengestelde interest doorrekenen', kind: 'screen', stage: 2, lane: 'rekentools' },
    { id: 'uitgavenmethode', scenarioId: 'UAT-REKEN-23', label: 'WF-REKEN-23 · Uitgave na pensioen: methode kiezen (pane)', kind: 'screen', stage: 2, lane: 'rekentools' },
    { id: 'aspiraties', scenarioId: 'UAT-REKEN-24', label: 'WF-REKEN-24 · Uitgave na pensioen "Zelf samenstellen"', kind: 'action', stage: 2, lane: 'rekentools', subOf: 'uitgavenmethode' },

    // ── 3 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Betrouwbaar rekenhulp-inzicht, losgekoppeld van de echte tijdas tot export', kind: 'outcome', stage: 3 },

    // ── 4 · cross-doorwerking ─────────────────────────────────────────────
    { id: 'x-toek-kernel', label: 'Toekomst · levensgebeurtenis-export deelt de horizon-kernel met de hoofdgrafiek', kind: 'cross', stage: 4, crossZone: 'TOEK' },
    { id: 'x-bezit-schuld', label: 'Bezit/Schuld · vereisten-deeplinks in de bibliotheek-checklist', kind: 'cross', stage: 4, crossZone: 'BEZIT' },
    { id: 'x-kruis-tiergate', label: 'Kruis · tier-gate zonder AI-add-on (WF-REKEN-02)', kind: 'cross', stage: 4, crossZone: 'KRUIS' },
  ],
  edges: [
    // instap → rekenhulpen
    { from: 'lijst', to: 'nieuwmetwill' },
    { from: 'lijst', to: 'naareve' },
    { from: 'lijst', to: 'verwijderen' },
    { from: 'nieuwmetwill', to: 'x-kruis-tiergate', kind: 'cross', label: 'tier-gate \'ai\'' },

    // rekenhulpen → bibliotheek
    { from: 'lijst', to: 'publiceren' },
    { from: 'publiceren', to: 'depubliceren' },
    { from: 'lijst', to: 'verkennen' },
    { from: 'verkennen', to: 'detailpreview' },
    { from: 'detailpreview', to: 'dupliceren' },
    { from: 'detailpreview', to: 'liken' },
    { from: 'detailpreview', to: 'melden' },
    { from: 'dupliceren', to: 'x-bezit-schuld', kind: 'cross', label: 'ontbrekende vereiste-deeplink' },

    // → losse rekentools (onafhankelijke tak vanaf instap)
    { from: 'lijst', to: 'inflatie' },
    { from: 'lijst', to: 'samengesteld' },
    { from: 'lijst', to: 'uitgavenmethode' },
    { from: 'uitgavenmethode', to: 'aspiraties' },

    // samenvloeien → uitkomst
    { from: 'verwijderen', to: 'uitkomst' },
    { from: 'naareve', to: 'uitkomst' },
    { from: 'depubliceren', to: 'uitkomst' },
    { from: 'liken', to: 'uitkomst' },
    { from: 'melden', to: 'uitkomst' },
    { from: 'dupliceren', to: 'uitkomst' },
    { from: 'inflatie', to: 'uitkomst' },
    { from: 'samengesteld', to: 'uitkomst' },
    { from: 'aspiraties', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-toek-kernel', kind: 'cross' },
  ],
}

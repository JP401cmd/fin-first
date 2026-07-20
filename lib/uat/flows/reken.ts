// Gecureerde Reken-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Rekentools & wat-als (WF-REKEN)"
// (WF-REKEN-01..24) en de acceptatie in lib/uat/acceptance/reken.ts. De
// knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-REKEN-NN) en erven daarmee de rondestatus. Het
// label toont bewust het WF-nummer, spiegelt lib/uat/flows/rapp.ts +
// nav.ts + ovz.ts + cash.ts + will.ts + start.ts.
//
// REKEN is — net als SCHULD/TOEK/WILL/OVZ/NAV — NIET aaneengesloten op
// WF-nummer: WF-REKEN-17 (bewaarde wat-als-scenario's: opslaan/laden/pinnen/
// verwijderen) heeft geen eigen UAT-REKEN-scenario (het UAT-plan wijst door
// naar UAT-TOEK-09, waar het spooklijn-overlay-gedrag al diepgaand getoetst
// wordt) en bestaat dus niet in de catalogus voor zone REKEN. Alle 23
// overige WF-REKEN-01..16/18..24 hebben wél een eigen knoop hieronder.
//
// Het proces leest links→rechts: instap (rekenhulp-lijst) → bibliotheek
// (CRUD/publiceren/dupliceren/liken/melden) → Wat-Als bereiken (deeplink/
// dream gate) → scenario opbouwen (presets/sliders/events/beslishulp) →
// verkennen (onzekerheid/chat/acties) → losse rekentools (inflatie/
// samengestelde interest/uitgave na pensioen) → uitkomst → cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md / zone-specifieke notitie): de rekenhulp-
// evaluator en de losse rekentools zijn een APART, gebruikersgestuurd
// sandbox-domein — losgekoppeld van de FIRE-projectie totdat een uitkomst
// expliciet als levensgebeurtenis wordt geëxporteerd (WF-REKEN-03) of als
// uitgavengrondslag wordt gekozen (WF-REKEN-23/24). De Wat-Als-kant draait
// wél op de horizon-kernel (`kind:'cross'` naar TOEK) — zelfde motor als de
// hoofdgrafiek, "consume don't recompute".
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

    // ── 2 · Wat-Als bereiken ──────────────────────────────────────────────
    { id: 'watalsbereiken', scenarioId: 'UAT-REKEN-12', label: 'WF-REKEN-12 · Wat-Als bereiken: deeplink, inline sliders, dream gate', kind: 'decision', stage: 2, lane: 'watals' },

    // ── 3 · scenario opbouwen ─────────────────────────────────────────────
    { id: 'preset', scenarioId: 'UAT-REKEN-13', label: 'WF-REKEN-13 · Wat-als-preset kiezen en effect aflezen', kind: 'action', stage: 3, lane: 'scenario' },
    { id: 'sliders', scenarioId: 'UAT-REKEN-14', label: 'WF-REKEN-14 · Scenario verfijnen met sliders en marktbias', kind: 'action', stage: 3, lane: 'scenario' },
    { id: 'events', scenarioId: 'UAT-REKEN-15', label: 'WF-REKEN-15 · Levensgebeurtenissen beheren en impact zien', kind: 'action', stage: 3, lane: 'scenario' },
    { id: 'beslishulp', scenarioId: 'UAT-REKEN-16', label: 'WF-REKEN-16 · Beslishulp: €X/mnd extra (beleggen/aflossen/noodfonds)', kind: 'action', stage: 3, lane: 'scenario' },
    { id: 'x-toek-scenarios', label: 'Toekomst · bewaarde scenario\'s als spooklijn-overlay (WF-REKEN-17)', kind: 'cross', stage: 3, lane: 'scenario', crossZone: 'TOEK' },

    // ── 4 · verkennen ─────────────────────────────────────────────────────
    { id: 'montecarlo', scenarioId: 'UAT-REKEN-18', label: 'WF-REKEN-18 · Onzekerheid (Monte Carlo) en grafiekweergaven', kind: 'action', stage: 4, lane: 'verkennen' },
    { id: 'chat', scenarioId: 'UAT-REKEN-19', label: 'WF-REKEN-19 · Met Fin over het scenario chatten', kind: 'action', stage: 4, lane: 'verkennen' },
    { id: 'acties', scenarioId: 'UAT-REKEN-20', label: 'WF-REKEN-20 · Concrete acties uit het scenario halen', kind: 'action', stage: 4, lane: 'verkennen' },

    // ── 5 · losse rekentools ──────────────────────────────────────────────
    { id: 'inflatie', scenarioId: 'UAT-REKEN-21', label: 'WF-REKEN-21 · Inflatie & koopkracht doorrekenen', kind: 'screen', stage: 5, lane: 'rekentools' },
    { id: 'samengesteld', scenarioId: 'UAT-REKEN-22', label: 'WF-REKEN-22 · Samengestelde interest doorrekenen', kind: 'screen', stage: 5, lane: 'rekentools' },
    { id: 'uitgavenmethode', scenarioId: 'UAT-REKEN-23', label: 'WF-REKEN-23 · Uitgave na pensioen: methode kiezen (pane)', kind: 'screen', stage: 5, lane: 'rekentools' },
    { id: 'aspiraties', scenarioId: 'UAT-REKEN-24', label: 'WF-REKEN-24 · Uitgave na pensioen "Zelf samenstellen"', kind: 'action', stage: 5, lane: 'rekentools', subOf: 'uitgavenmethode' },

    // ── 6 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Betrouwbaar wat-als-inzicht, losgekoppeld van de echte tijdas tot export', kind: 'outcome', stage: 6 },

    // ── 7 · cross-doorwerking ─────────────────────────────────────────────
    { id: 'x-toek-kernel', label: 'Toekomst · horizon-kernel (zelfde motor als de hoofdgrafiek)', kind: 'cross', stage: 7, crossZone: 'TOEK' },
    { id: 'x-ovz-legestaat', label: 'Overzicht · lege-staat-CTA "Vermogen toevoegen" (geen basisgegevens)', kind: 'cross', stage: 7, crossZone: 'OVZ' },
    { id: 'x-bezit-schuld', label: 'Bezit/Schuld · vereisten-deeplinks in de bibliotheek-checklist', kind: 'cross', stage: 7, crossZone: 'BEZIT' },
    { id: 'x-kruis-tiergate', label: 'Kruis · tier-gate zonder AI-add-on (WF-REKEN-02)', kind: 'cross', stage: 7, crossZone: 'KRUIS' },
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

    // → Wat-Als bereiken
    { from: 'lijst', to: 'watalsbereiken' },
    { from: 'watalsbereiken', to: 'x-ovz-legestaat', kind: 'cross', label: 'geen basisgegevens' },

    // → scenario opbouwen
    { from: 'watalsbereiken', to: 'preset' },
    { from: 'watalsbereiken', to: 'sliders' },
    { from: 'preset', to: 'events' },
    { from: 'sliders', to: 'events' },
    { from: 'events', to: 'beslishulp' },
    { from: 'beslishulp', to: 'naareve' },
    { from: 'preset', to: 'x-toek-scenarios', kind: 'cross' },

    // → verkennen
    { from: 'events', to: 'montecarlo' },
    { from: 'events', to: 'chat' },
    { from: 'sliders', to: 'acties' },

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
    { from: 'montecarlo', to: 'uitkomst' },
    { from: 'chat', to: 'uitkomst' },
    { from: 'acties', to: 'uitkomst' },
    { from: 'beslishulp', to: 'uitkomst' },
    { from: 'inflatie', to: 'uitkomst' },
    { from: 'samengesteld', to: 'uitkomst' },
    { from: 'aspiraties', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-toek-kernel', kind: 'cross' },
  ],
}

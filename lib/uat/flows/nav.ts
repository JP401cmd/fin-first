// Gecureerde Nav-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Navigatie, shell & app-brede bediening
// (WF-NAV)" (WF-NAV-01..26) en de acceptatie in lib/uat/acceptance/nav.ts. De
// knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-NAV-NN) en erven daarmee de rondestatus. Het label
// toont bewust het WF-nummer, spiegelt lib/uat/flows/budget.ts + start.ts +
// will.ts + cash.ts + ovz.ts.
//
// NAV is — net als SCHULD/TOEK/WILL/OVZ — NIET aaneengesloten op WF-nummer:
// WF-NAV-13 (uitloggen) heeft geen eigen UAT-NAV-scenario (het UAT-plan wijst
// door naar UAT-START-15) en bestaat dus niet in de catalogus voor zone NAV.
// Alle 25 overige WF-NAV-01..12/14..26 hebben wél een eigen knoop hieronder.
//
// Het proces leest links→rechts: instap (desktop-sidebar / mobiele pill) →
// status & zoeken (status-dots, command-palette) → weergave & privacy
// (Eenvoudig/Volledig, maskering) → sessie & uitloggen (verlopen sessie,
// cross naar START) → stack & deeplinks (browser-terug, legacy-redirects) →
// sync & meldingen → perspectief & chat & sheets → randvoorwaarden
// (a11y, platform-banner, mobiele bottom-tabs, PWA, foutpagina's) →
// uitkomst → cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md / zone-specifieke notitie): NAV heeft GEEN eigen
// pagina's — het toetst app-brede bediening die op élke ingelogde pagina
// aanwezig is. Vandaar veel 'ui-only' (interactie/state zonder berekening)
// en één 'consistency'-knoop (status-dots moeten exact de landingskaarten
// spiegelen, overlap met OVZ/CASH/BELAST — geen eigen formule).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const NAV_FLOW: UatFlow = {
  zone: 'NAV',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Elke ingelogde pagina (cross-cutting shell)', kind: 'entry', stage: 0 },
    { id: 'platformbeslis', label: 'Desktop (≥1024px) of mobiel?', kind: 'decision', stage: 0 },
    { id: 'sidebar', scenarioId: 'UAT-NAV-01', label: 'WF-NAV-01 · Desktop-sidebar navigeren', kind: 'screen', stage: 0, lane: 'instap' },
    { id: 'sidebarcollapse', scenarioId: 'UAT-NAV-02', label: 'WF-NAV-02 · Sidebar in-/uitklappen', kind: 'action', stage: 0, lane: 'instap', subOf: 'sidebar' },
    { id: 'pill', scenarioId: 'UAT-NAV-04', label: 'WF-NAV-04 · Mobiele nav-pill + NavMenuSheet', kind: 'screen', stage: 0, lane: 'instap' },
    { id: 'topbar', scenarioId: 'UAT-NAV-05', label: 'WF-NAV-05 · Mobiele TopBar (titel/terug)', kind: 'screen', stage: 0, lane: 'instap', subOf: 'pill' },
    { id: 'utilitycluster', scenarioId: 'UAT-NAV-06', label: 'WF-NAV-06 · Mobiele utility-cluster', kind: 'action', stage: 0, lane: 'instap', subOf: 'pill' },

    // ── 1 · status & zoeken ───────────────────────────────────────────────
    { id: 'statusdots', scenarioId: 'UAT-NAV-03', label: 'WF-NAV-03 · Status-dots lezen', kind: 'screen', stage: 1, lane: 'status' },
    { id: 'palette', scenarioId: 'UAT-NAV-07', label: 'WF-NAV-07 · Command-palette: pagina\'s', kind: 'screen', stage: 1, lane: 'status' },
    { id: 'palettedata', scenarioId: 'UAT-NAV-08', label: 'WF-NAV-08 · Command-palette: "Mijn data"', kind: 'action', stage: 1, lane: 'status', subOf: 'palette' },
    { id: 'paletteacties', scenarioId: 'UAT-NAV-09', label: 'WF-NAV-09 · Command-palette: acties', kind: 'action', stage: 1, lane: 'status', subOf: 'palette' },

    // ── 2 · weergave & privacy ────────────────────────────────────────────
    { id: 'weergavemodus', scenarioId: 'UAT-NAV-10', label: 'WF-NAV-10 · Weergavemodus Eenvoudig ↔ Volledig', kind: 'action', stage: 2, lane: 'weergave' },
    { id: 'privacy', scenarioId: 'UAT-NAV-11', label: 'WF-NAV-11 · Bedragen maskeren', kind: 'action', stage: 2, lane: 'weergave' },

    // ── 3 · sessie & uitloggen ────────────────────────────────────────────
    { id: 'sessieverlopen', scenarioId: 'UAT-NAV-12', label: 'WF-NAV-12 · Sessie verlopen: inline herinloggen', kind: 'action', stage: 3, lane: 'sessie' },
    { id: 'x-start', label: 'Start · Uitloggen (WF-NAV-13, gedekt door UAT-START-15)', kind: 'cross', stage: 3, lane: 'sessie', crossZone: 'START' },

    // ── 4 · stack & deeplinks ─────────────────────────────────────────────
    { id: 'navstack', scenarioId: 'UAT-NAV-14', label: 'WF-NAV-14 · Browser-terug & navigatie-stack', kind: 'screen', stage: 4, lane: 'stack' },
    { id: 'tabdeeplink', scenarioId: 'UAT-NAV-15', label: 'WF-NAV-15 · Oude ?tab=-deeplinks op /toekomst', kind: 'action', stage: 4, lane: 'stack' },
    { id: 'legacyredirect', scenarioId: 'UAT-NAV-16', label: 'WF-NAV-16 · Legacy-routes & redirect-net', kind: 'action', stage: 4, lane: 'stack' },

    // ── 5 · sync & meldingen ──────────────────────────────────────────────
    { id: 'sync', scenarioId: 'UAT-NAV-17', label: 'WF-NAV-17 · Globale sync + sync-rapport', kind: 'action', stage: 5, lane: 'sync' },
    { id: 'meldingen', scenarioId: 'UAT-NAV-18', label: 'WF-NAV-18 · Meldingen via het bel-icoon', kind: 'action', stage: 5, lane: 'sync' },

    // ── 6 · perspectief, chat & sheets ────────────────────────────────────
    { id: 'perspectief', scenarioId: 'UAT-NAV-19', label: 'WF-NAV-19 · Perspectief wisselen', kind: 'action', stage: 6, lane: 'perspectief' },
    { id: 'willchat', scenarioId: 'UAT-NAV-20', label: 'WF-NAV-20 · Will-chat openen', kind: 'action', stage: 6, lane: 'perspectief' },
    { id: 'bottomsheet', scenarioId: 'UAT-NAV-21', label: 'WF-NAV-21 · BottomSheet-bediening', kind: 'action', stage: 6, lane: 'perspectief' },

    // ── 7 · randvoorwaarden ───────────────────────────────────────────────
    { id: 'a11y', scenarioId: 'UAT-NAV-22', label: 'WF-NAV-22 · Toegankelijkheid (skip-link, toetsenbord)', kind: 'action', stage: 7, lane: 'randvoorwaarden' },
    { id: 'platformbanner', scenarioId: 'UAT-NAV-23', label: 'WF-NAV-23 · Platform-banner', kind: 'action', stage: 7, lane: 'randvoorwaarden' },
    { id: 'bottomtabs', scenarioId: 'UAT-NAV-24', label: 'WF-NAV-24 · Mobiele bottom-tabs (dode code)', kind: 'action', stage: 7, lane: 'randvoorwaarden' },
    { id: 'pwa', scenarioId: 'UAT-NAV-25', label: 'WF-NAV-25 · PWA-installatie & offline', kind: 'action', stage: 7, lane: 'randvoorwaarden' },
    { id: 'foutpaginas', scenarioId: 'UAT-NAV-26', label: 'WF-NAV-26 · Foutpagina\'s (404 + error-boundary)', kind: 'screen', stage: 7, lane: 'randvoorwaarden' },

    // ── 8 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Consistente app-brede bediening op elke pagina', kind: 'outcome', stage: 8 },

    // ── 9 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht · netto vermogen volgt perspectief/weergave', kind: 'cross', stage: 9, crossZone: 'OVZ' },
    { id: 'x-will', label: 'Will · chatpaneel + prompt-deeplinks', kind: 'cross', stage: 9, crossZone: 'WILL' },
    { id: 'x-mijn', label: 'Mijn · huishoud-uitnodiging (testhuishouden voor perspectief)', kind: 'cross', stage: 9, crossZone: 'MIJN' },
  ],
  edges: [
    // instap
    { from: 'nav', to: 'platformbeslis' },
    { from: 'platformbeslis', to: 'sidebar', kind: 'branch', label: 'desktop' },
    { from: 'sidebar', to: 'sidebarcollapse' },
    { from: 'platformbeslis', to: 'pill', kind: 'branch', label: 'mobiel' },
    { from: 'pill', to: 'topbar' },
    { from: 'pill', to: 'utilitycluster' },

    // status & zoeken
    { from: 'sidebar', to: 'statusdots' },
    { from: 'pill', to: 'statusdots' },
    { from: 'nav', to: 'palette' },
    { from: 'palette', to: 'palettedata' },
    { from: 'palette', to: 'paletteacties' },

    // weergave & privacy
    { from: 'paletteacties', to: 'weergavemodus' },
    { from: 'paletteacties', to: 'privacy' },

    // sessie & uitloggen
    { from: 'nav', to: 'sessieverlopen' },
    { from: 'paletteacties', to: 'x-start', kind: 'cross', label: '⌘K "Uitloggen"' },

    // stack & deeplinks
    { from: 'pill', to: 'navstack' },
    { from: 'nav', to: 'tabdeeplink' },
    { from: 'nav', to: 'legacyredirect' },

    // sync & meldingen
    { from: 'sidebar', to: 'sync' },
    { from: 'utilitycluster', to: 'meldingen' },

    // perspectief, chat & sheets
    { from: 'paletteacties', to: 'perspectief' },
    { from: 'perspectief', to: 'x-mijn', kind: 'cross', label: 'testhuishouden (2 accounts)' },
    { from: 'nav', to: 'willchat' },
    { from: 'willchat', to: 'x-will', kind: 'cross' },
    { from: 'pill', to: 'bottomsheet' },

    // randvoorwaarden
    { from: 'nav', to: 'a11y' },
    { from: 'nav', to: 'platformbanner' },
    { from: 'pill', to: 'bottomtabs' },
    { from: 'nav', to: 'pwa' },
    { from: 'nav', to: 'foutpaginas' },

    // samenvloeien → uitkomst
    { from: 'sidebarcollapse', to: 'uitkomst' },
    { from: 'topbar', to: 'uitkomst' },
    { from: 'utilitycluster', to: 'uitkomst' },
    { from: 'statusdots', to: 'uitkomst' },
    { from: 'palettedata', to: 'uitkomst' },
    { from: 'weergavemodus', to: 'uitkomst' },
    { from: 'privacy', to: 'uitkomst' },
    { from: 'sessieverlopen', to: 'uitkomst' },
    { from: 'navstack', to: 'uitkomst' },
    { from: 'tabdeeplink', to: 'uitkomst' },
    { from: 'legacyredirect', to: 'uitkomst' },
    { from: 'sync', to: 'uitkomst' },
    { from: 'meldingen', to: 'uitkomst' },
    { from: 'perspectief', to: 'uitkomst' },
    { from: 'bottomsheet', to: 'uitkomst' },
    { from: 'a11y', to: 'uitkomst' },
    { from: 'platformbanner', to: 'uitkomst' },
    { from: 'bottomtabs', to: 'uitkomst' },
    { from: 'pwa', to: 'uitkomst' },
    { from: 'foutpaginas', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-ovz', kind: 'cross' },
  ],
}

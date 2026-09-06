// Gecureerde Start-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Publiek, registratie & onboarding
// (WF-START)" (WF-START-01..26, plus WF-START-27 als latere aanvulling — het
// deelpad van ADR 0067 — en WF-START-28, de onboarding-stap "Jouw plan" van
// ADR 0129) en de acceptatie in lib/uat/acceptance/start.ts.
// De knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-START-NN) en erven daarmee de rondestatus. Het label
// toont bewust het WF-nummer, spiegelt lib/uat/flows/budget.ts + schuld.ts + toek.ts.
//
// START is — net als BUDGET — een AANEENGESLOTEN catalogus: alle
// WF-START-01..28 hebben een eigen UAT-scenario en dus een eigen knoop
// hieronder. Geen verwijsregel-gaten (UAT-START-15 wordt WÉL door het
// NAV-deelgebied naar hier terugverwezen als "leidend scenario" — dat is een
// verwijzing VAN NAV NAAR START, niet andersom, dus hier gewoon een normale knoop).
//
// Het proces leest links→rechts: instap (marketing-site verkennen) →
// vrijheidscheck (anoniem invullen → rapport → PDF) → conversie/registratie
// (via check of los) → login/wachtwoord (dagelijkse toegang + herstel) →
// routebescherming (auth-grens, geldt overal) → onboarding (poort → 7 groepen
// → afronden) → uitkomst (in de app geland) → cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md): de rapportcijfers (WF-START-08) en de
// conversie-spaarquote (WF-START-10) MOETEN identiek zijn aan wat de gebruiker
// later op /overzicht/budget ziet (resolveSavingsSource is de ene bron) —
// net zoals de onboarding-spaarquote-preview (WF-START-18) dezelfde motor
// gebruikt. Het gezondheidsgetal en vrijheids-% in het rapport zijn NIET
// hand-narekenbaar (horizon-kernel / 7-indicator-samenstelling) — bewust apart
// gehouden van de wél exacte FIRE-eligible-nettovermogen-som.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const START_FLOW: UatFlow = {
  zone: 'START',
  nodes: [
    // ── 0 · instap (marketing-site) ─────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar de landingspagina (/)', kind: 'entry', stage: 0 },
    { id: 'landing', scenarioId: 'UAT-START-01', label: 'WF-START-01 · Landingspagina verkennen', kind: 'screen', stage: 0, lane: 'marketing' },
    { id: 'marketingnav', scenarioId: 'UAT-START-02', label: 'WF-START-02 · Navigeren door de marketing-site', kind: 'screen', stage: 0, lane: 'marketing' },
    { id: 'functies', scenarioId: 'UAT-START-03', label: 'WF-START-03 · Functies & FAQ', kind: 'screen', stage: 0, lane: 'marketing', subOf: 'marketingnav' },
    { id: 'prijzen', scenarioId: 'UAT-START-04', label: 'WF-START-04 · Prijzen vergelijken', kind: 'screen', stage: 0, lane: 'marketing', subOf: 'marketingnav' },
    { id: 'vertrouwen', scenarioId: 'UAT-START-05', label: 'WF-START-05 · Vertrouwen, juridisch & contact', kind: 'screen', stage: 0, lane: 'marketing', subOf: 'marketingnav' },

    // ── 1 · vrijheidscheck ───────────────────────────────────────────────────
    { id: 'checkbeslis', label: 'Vrijheidscheck of direct registreren?', kind: 'decision', stage: 1 },
    { id: 'check', scenarioId: 'UAT-START-06', label: 'WF-START-06 · Vrijheidscheck invullen', kind: 'screen', stage: 1, lane: 'check' },
    { id: 'checkresume', scenarioId: 'UAT-START-07', label: 'WF-START-07 · Check onderbreken/hervatten', kind: 'action', stage: 1, lane: 'check', subOf: 'check' },
    { id: 'rapport', scenarioId: 'UAT-START-08', label: 'WF-START-08 · Vrijheidsrapport lezen', kind: 'screen', stage: 1, lane: 'check' },
    { id: 'rapportpdf', scenarioId: 'UAT-START-09', label: 'WF-START-09 · Rapport downloaden als PDF', kind: 'action', stage: 1, lane: 'check', subOf: 'rapport' },
    { id: 'rapportdelen', scenarioId: 'UAT-START-27', label: 'WF-START-27 · Rapport delen zonder bedragen', kind: 'action', stage: 1, lane: 'check', subOf: 'rapport' },

    // ── 2 · conversie / registratie ──────────────────────────────────────────
    { id: 'activeren', scenarioId: 'UAT-START-10', label: 'WF-START-10 · Account maken + check activeren (conversie)', kind: 'action', stage: 2, lane: 'account' },
    { id: 'registreren', scenarioId: 'UAT-START-11', label: 'WF-START-11 · Registreren zonder check', kind: 'action', stage: 2, lane: 'account' },

    // ── 3 · login & wachtwoord ────────────────────────────────────────────────
    { id: 'login', scenarioId: 'UAT-START-12', label: 'WF-START-12 · Inloggen', kind: 'screen', stage: 3, lane: 'login' },
    { id: 'wwvergeten', scenarioId: 'UAT-START-13', label: 'WF-START-13 · Wachtwoord vergeten: resetlink', kind: 'screen', stage: 3, lane: 'login' },
    { id: 'wwnieuw', scenarioId: 'UAT-START-14', label: 'WF-START-14 · Nieuw wachtwoord instellen', kind: 'screen', stage: 3, lane: 'login', subOf: 'wwvergeten' },
    { id: 'uitloggen', scenarioId: 'UAT-START-15', label: 'WF-START-15 · Uitloggen', kind: 'action', stage: 3, lane: 'login' },

    // ── 4 · routebescherming (auth-grens, geldt overal) ──────────────────────
    { id: 'routebescherming', scenarioId: 'UAT-START-16', label: 'WF-START-16 · Routebescherming (heen én terug)', kind: 'screen', stage: 4, lane: 'beveiliging' },

    // ── 5 · onboarding ────────────────────────────────────────────────────────
    { id: 'onboardpoort', label: 'onboarding_completed?', kind: 'decision', stage: 5 },
    { id: 'welkomst', scenarioId: 'UAT-START-17', label: 'WF-START-17 · Welkomstpopup', kind: 'screen', stage: 5, lane: 'onboarding' },
    { id: 'onboarding', scenarioId: 'UAT-START-18', label: 'WF-START-18 · Onboarding volledig doorlopen', kind: 'screen', stage: 5, lane: 'onboarding' },
    { id: 'bezitschuld', scenarioId: 'UAT-START-19', label: 'WF-START-19 · Bezittingen & schulden (huis+hypotheek)', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'pensioen', scenarioId: 'UAT-START-20', label: 'WF-START-20 · Pensioen opgeven', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'spaardoel', scenarioId: 'UAT-START-21', label: 'WF-START-21 · Spaardoel kiezen of overslaan', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'plan', scenarioId: 'UAT-START-28', label: 'WF-START-28 · "Jouw plan": stopmoment × eind-vorm (ADR 0129)', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'schatting', scenarioId: 'UAT-START-29', label: 'WF-START-29 · "Schat het voor me" (cohort-schatting, UR3-05)', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'defer', scenarioId: 'UAT-START-22', label: 'WF-START-22 · "Later invullen" (defer-pad)', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'obhervatten', scenarioId: 'UAT-START-23', label: 'WF-START-23 · Onboarding onderbreken/hervatten', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'obretry', scenarioId: 'UAT-START-24', label: 'WF-START-24 · Fout bij afronden herstellen (retry)', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },
    { id: 'obuitloggen', scenarioId: 'UAT-START-25', label: 'WF-START-25 · Uitloggen vanuit onboarding', kind: 'action', stage: 5, lane: 'onboarding', subOf: 'onboarding' },

    // ── 6 · uitkomst ──────────────────────────────────────────────────────────
    { id: 'overgang', scenarioId: 'UAT-START-26', label: 'WF-START-26 · Overgang onboarding → app', kind: 'screen', stage: 6 },
    { id: 'uitkomst', label: 'Gebruiker in de app: bezittingen/schulden/doel/pensioen/plan zichtbaar', kind: 'outcome', stage: 6 },

    // ── 7 · cross-doorwerking (OUTPUT) ───────────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht-hub · netto vermogen & cashflow-instellingen', kind: 'cross', stage: 7, crossZone: 'OVZ' },
    { id: 'x-toek', label: 'Toekomst · doelen, pensioen-life-event, FIRE-parameters', kind: 'cross', stage: 7, crossZone: 'TOEK' },
    { id: 'x-will', label: 'Fin · coach-bubble suggereert overgeslagen (deferred) velden', kind: 'cross', stage: 7, crossZone: 'WILL' },
    { id: 'x-nav', label: 'Navigatie-shell · routebescherming/uitloggen hergebruikt door NAV', kind: 'cross', stage: 7, crossZone: 'NAV' },
  ],
  edges: [
    // instap
    { from: 'nav', to: 'landing' },
    { from: 'landing', to: 'marketingnav' },
    { from: 'marketingnav', to: 'functies' },
    { from: 'marketingnav', to: 'prijzen' },
    { from: 'marketingnav', to: 'vertrouwen' },
    { from: 'marketingnav', to: 'checkbeslis' },

    // vrijheidscheck vs. direct registreren
    { from: 'checkbeslis', to: 'check', kind: 'branch', label: 'vrijheidscheck' },
    { from: 'checkbeslis', to: 'registreren', kind: 'branch', label: 'direct registreren' },
    { from: 'check', to: 'checkresume' },
    { from: 'check', to: 'rapport' },
    { from: 'rapport', to: 'rapportpdf' },
    { from: 'rapport', to: 'rapportdelen' },
    { from: 'rapport', to: 'activeren' },

    // conversie/registratie → login
    { from: 'activeren', to: 'onboardpoort' },
    { from: 'registreren', to: 'login' },
    { from: 'login', to: 'wwvergeten' },
    { from: 'wwvergeten', to: 'wwnieuw' },
    { from: 'login', to: 'uitloggen' },
    { from: 'login', to: 'routebescherming' },
    { from: 'wwnieuw', to: 'routebescherming' },
    { from: 'uitloggen', to: 'routebescherming' },
    { from: 'routebescherming', to: 'onboardpoort' },

    // onboarding-poort
    { from: 'onboardpoort', to: 'welkomst', kind: 'branch', label: 'niet geonboard' },
    { from: 'onboardpoort', to: 'overgang', kind: 'branch', label: 'al geonboard' },
    { from: 'welkomst', to: 'onboarding' },
    { from: 'onboarding', to: 'bezitschuld' },
    { from: 'onboarding', to: 'pensioen' },
    { from: 'onboarding', to: 'spaardoel' },
    { from: 'onboarding', to: 'plan' },
    { from: 'onboarding', to: 'defer' },
    { from: 'onboarding', to: 'obhervatten' },
    { from: 'onboarding', to: 'obretry' },
    { from: 'onboarding', to: 'obuitloggen' },
    { from: 'onboarding', to: 'overgang' },

    // samenvloeien → uitkomst
    { from: 'overgang', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-ovz', kind: 'cross' },
    { from: 'uitkomst', to: 'x-toek', kind: 'cross' },
    { from: 'plan', to: 'x-toek', kind: 'cross', label: 'stop-anker × eind-vorm → tijdas + Voorkeuren (WF-TOEK-24)' },
    { from: 'defer', to: 'x-will', kind: 'cross', label: 'overgeslagen velden → coach-suggestie' },
    { from: 'routebescherming', to: 'x-nav', kind: 'cross', label: 'auth-grens hergebruikt door NAV' },
  ],
}

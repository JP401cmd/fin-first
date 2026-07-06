// Gecureerde KRUIS-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Cross-module consistentie & doorwerking
// (WF-KRUIS)" (WF-KRUIS-01..25) + Deel 2 §2.8 (de SSoT-tabel per kerngetal) en de
// acceptatie in lib/uat/acceptance/kruis.ts. De knopen met `scenarioId` verwijzen
// naar de UAT-scenario-ID's uit lib/uat/catalog.ts (UAT-KRUIS-NN) en erven daarmee
// de rondestatus. Het label toont bewust het WF-nummer, spiegelt bezit/toek/schuld.
//
// KRUIS is bij uitstek geschikt voor dit model: de zone IS de doorwerking-keten.
// De flow leest links→rechts als één belofte: uit één SSoT-kerngetal per grootheid
// (stage 0) lopen BRON-MUTATIES (stage 1, `action`) — een bezit/schuld/transactie/
// instelling wijzigen — naar CONSISTENTIE-TOETSEN (stage 2, `screen`: hetzelfde
// getal moet overal identiek zijn, delta = 0) en vervolgens naar de OPPERVLAKKEN &
// doorwerking (stage 3) — snapshot, briefing, perspectief, deel-kaart, rapportages,
// Will, legacy-routes — tot de uitkomst (stage 5): alle oppervlakken consistent.
// De AI-tier-gate (25) en de volledige gebruikersreis (26) sluiten aan.
//
// Veel `kind:'cross'`-knopen wijzen naar de `kruisZones` uit de catalogus — dat
// is precies wat KRUIS onderscheidt: elke keten raakt meerdere domeinen. UAT-KRUIS-26
// heeft in catalog.ts `wf: null` (nieuw reis-scenario); het label gebruikt daarom
// "Volledige gebruikersreis" i.p.v. een WF-nummer.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const KRUIS_FLOW: UatFlow = {
  zone: 'KRUIS',
  nodes: [
    // ── 0 · instap: de canonieke SSoT-kerngetallen ─────────────────────────
    { id: 'ssot', label: 'Eén SSoT per kerngetal (vermogen · spaarquote · vrijheids-% · gezondheid · Box 3 · FIRE · SWR · dagtarief)', kind: 'entry', stage: 0 },

    // ── 1 · bron-mutaties (een wijziging die overal hoort door te werken) ───
    { id: 'k02', scenarioId: 'UAT-KRUIS-02', label: 'WF-KRUIS-02 · Bezit toevoegen → hele keten', kind: 'action', stage: 1, lane: 'mutatie' },
    { id: 'k03', scenarioId: 'UAT-KRUIS-03', label: 'WF-KRUIS-03 · Herwaarderen/verwijderen → afgeleiden zakken', kind: 'action', stage: 1, lane: 'mutatie' },
    { id: 'k04', scenarioId: 'UAT-KRUIS-04', label: 'WF-KRUIS-04 · Schuld toevoegen/aflossen → vermogen+DSTI+Box 3+FIRE', kind: 'action', stage: 1, lane: 'mutatie' },
    { id: 'k05', scenarioId: 'UAT-KRUIS-05', label: 'WF-KRUIS-05 · Transactie importeren → budget+cashflow+spaarquote', kind: 'action', stage: 1, lane: 'mutatie' },
    { id: 'k07', scenarioId: 'UAT-KRUIS-07', label: 'WF-KRUIS-07 · Spaarbron wijzigen → FIRE beweegt overal', kind: 'action', stage: 1, lane: 'mutatie' },
    { id: 'k10', scenarioId: 'UAT-KRUIS-10', label: 'WF-KRUIS-10 · Housing-strategie → vrijheid/FIRE bewegen, vermogen blijft', kind: 'action', stage: 1, lane: 'mutatie' },
    { id: 'k14', scenarioId: 'UAT-KRUIS-14', label: 'WF-KRUIS-14 · Markt-aannames → SWR+FIRE-doel+beide projecties', kind: 'action', stage: 1, lane: 'mutatie' },
    { id: 'k15', scenarioId: 'UAT-KRUIS-15', label: 'WF-KRUIS-15 · Levensgebeurtenis → tijdas+overzicht+FIRE', kind: 'action', stage: 1, lane: 'mutatie' },

    // ── 1 · cross-bronnen (waar de mutatie zijn oorsprong heeft) ───────────
    { id: 'x-bezit', label: 'Bezittingen', kind: 'cross', stage: 1, lane: 'mutatie', crossZone: 'BEZIT' },
    { id: 'x-schuld', label: 'Schulden', kind: 'cross', stage: 1, lane: 'mutatie', crossZone: 'SCHULD' },
    { id: 'x-cash', label: 'Cashflow & import', kind: 'cross', stage: 1, lane: 'mutatie', crossZone: 'CASH' },
    { id: 'x-budget', label: 'Budgetteren', kind: 'cross', stage: 1, lane: 'mutatie', crossZone: 'BUDGET' },

    // ── 2 · consistentie-toetsen (zelfde getal overal — delta = 0) ─────────
    { id: 'k01', scenarioId: 'UAT-KRUIS-01', label: 'WF-KRUIS-01 · Netto vermogen: één getal overal', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k06', scenarioId: 'UAT-KRUIS-06', label: 'WF-KRUIS-06 · Spaarquote: één getal overal', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k08', scenarioId: 'UAT-KRUIS-08', label: 'WF-KRUIS-08 · Vrijheidsvoortgang (%) overal gelijk', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k09', scenarioId: 'UAT-KRUIS-09', label: 'WF-KRUIS-09 · Grondslag-verschil (netto ≠ FIRE-eligible) — verwacht', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k11', scenarioId: 'UAT-KRUIS-11', label: 'WF-KRUIS-11 · Gezondheidsgetal identiek /overzicht ↔ /toekomst', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k12', scenarioId: 'UAT-KRUIS-12', label: 'WF-KRUIS-12 · Box 3: drie bewuste weergaven', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k13', scenarioId: 'UAT-KRUIS-13', label: 'WF-KRUIS-13 · FIRE-datum/-leeftijd per constructie gelijk', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k18', scenarioId: 'UAT-KRUIS-18', label: 'WF-KRUIS-18 · Status-semantiek: sidebar==kaart==banner==box', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'k20', scenarioId: 'UAT-KRUIS-20', label: 'WF-KRUIS-20 · Vrijheidstijd: één dagtarief overal', kind: 'screen', stage: 2, lane: 'consistentie' },
    { id: 'x-belast', label: 'Belasting (Box 1/2/3)', kind: 'cross', stage: 2, lane: 'consistentie', crossZone: 'BELAST' },
    { id: 'x-toek', label: 'Toekomst & tijdas', kind: 'cross', stage: 2, lane: 'consistentie', crossZone: 'TOEK' },

    // ── 3 · oppervlakken & doorwerking (waar de kerngetallen weer opduiken) ─
    { id: 'k16', scenarioId: 'UAT-KRUIS-16', label: 'WF-KRUIS-16 · Maandsnapshot & trend spoort met live', kind: 'screen', stage: 3, lane: 'oppervlak' },
    { id: 'k17', scenarioId: 'UAT-KRUIS-17', label: 'WF-KRUIS-17 · Briefing-freeze vs. live (bewust verschil)', kind: 'screen', stage: 3, lane: 'oppervlak' },
    { id: 'k19', scenarioId: 'UAT-KRUIS-19', label: 'WF-KRUIS-19 · Perspectief-wissel: consistent omgerekend', kind: 'screen', stage: 3, lane: 'oppervlak' },
    { id: 'k21', scenarioId: 'UAT-KRUIS-21', label: 'WF-KRUIS-21 · Deel-kaart: cijfers sporen met de app', kind: 'screen', stage: 3, lane: 'oppervlak' },
    { id: 'k22', scenarioId: 'UAT-KRUIS-22', label: 'WF-KRUIS-22 · Rapportages sluiten aan op live', kind: 'screen', stage: 3, lane: 'oppervlak' },
    { id: 'k23', scenarioId: 'UAT-KRUIS-23', label: 'WF-KRUIS-23 · Will (AI) noemt dezelfde getallen als de UI', kind: 'screen', stage: 3, lane: 'oppervlak' },
    { id: 'k24', scenarioId: 'UAT-KRUIS-24', label: 'WF-KRUIS-24 · Legacy backing-routes = zelfde cijfers', kind: 'screen', stage: 3, lane: 'oppervlak' },
    { id: 'x-ovz', label: 'Overzicht-hub', kind: 'cross', stage: 3, lane: 'oppervlak', crossZone: 'OVZ' },
    { id: 'x-rapp', label: 'Rapportages', kind: 'cross', stage: 3, lane: 'oppervlak', crossZone: 'RAPP' },
    { id: 'x-mijn', label: 'Mijn & huishouden (2e account)', kind: 'cross', stage: 3, lane: 'oppervlak', crossZone: 'MIJN' },
    { id: 'x-will', label: 'Will, berichten & krant', kind: 'cross', stage: 3, lane: 'oppervlak', crossZone: 'WILL' },
    { id: 'x-nav', label: 'Navigatie & legacy-routes', kind: 'cross', stage: 3, lane: 'oppervlak', crossZone: 'NAV' },

    // ── 4 · AI-tier-gate over álle AI-oppervlakken ─────────────────────────
    { id: 'k25', scenarioId: 'UAT-KRUIS-25', label: 'WF-KRUIS-25 · Tier-gate zonder AI-add-on (alle AI-oppervlakken)', kind: 'screen', stage: 4, lane: 'gate' },
    { id: 'x-reken', label: 'Rekentools & wat-als', kind: 'cross', stage: 4, lane: 'gate', crossZone: 'REKEN' },

    // ── 5 · volledige gebruikersreis (som van de keten) ────────────────────
    { id: 'k26', scenarioId: 'UAT-KRUIS-26', label: 'UAT-KRUIS-26 · Volledige gebruikersreis (registratie → vrijheidsinzicht)', kind: 'screen', stage: 5, lane: 'reis' },
    { id: 'x-start', label: 'Registratie & onboarding', kind: 'cross', stage: 5, lane: 'reis', crossZone: 'START' },

    // ── 6 · uitkomst ───────────────────────────────────────────────────────
    { id: 'consistent', label: 'Alle oppervlakken tonen consistente cijfers (delta = 0, doorwerking overal)', kind: 'outcome', stage: 6 },
  ],
  edges: [
    // instap → bron-mutaties
    { from: 'ssot', to: 'k02' },
    { from: 'ssot', to: 'k03' },
    { from: 'ssot', to: 'k04' },
    { from: 'ssot', to: 'k05' },
    { from: 'ssot', to: 'k07' },
    { from: 'ssot', to: 'k10' },
    { from: 'ssot', to: 'k14' },
    { from: 'ssot', to: 'k15' },
    // instap → directe "lees hetzelfde getal"-toetsen (geen mutatie nodig)
    { from: 'ssot', to: 'k01' },
    { from: 'ssot', to: 'k06' },
    { from: 'ssot', to: 'k08' },
    { from: 'ssot', to: 'k20' },
    { from: 'ssot', to: 'k18' },

    // mutaties ← hun bron-domein (cross)
    { from: 'x-bezit', to: 'k02', kind: 'cross' },
    { from: 'x-bezit', to: 'k03', kind: 'cross' },
    { from: 'x-schuld', to: 'k04', kind: 'cross' },
    { from: 'x-cash', to: 'k05', kind: 'cross' },
    { from: 'x-budget', to: 'k05', kind: 'cross' },
    { from: 'x-cash', to: 'k07', kind: 'cross' },

    // mutaties → consistentie-toetsen (de doorwerking)
    { from: 'k02', to: 'k01', label: '+vermogen' },
    { from: 'k03', to: 'k01', label: '−vermogen' },
    { from: 'k04', to: 'k01' },
    { from: 'k04', to: 'k18', kind: 'branch', label: 'DSTI-status' },
    { from: 'k05', to: 'k06', label: 'spaarquote' },
    { from: 'k07', to: 'k13', label: 'FIRE-verschuiving' },
    { from: 'k10', to: 'k09', label: 'grondslag' },
    { from: 'k10', to: 'k13' },
    { from: 'k14', to: 'k13', label: 'SWR→FIRE-doel' },
    { from: 'k15', to: 'k13' },

    // consistentie-toetsen ← cross-domeinen die ze raken
    { from: 'k04', to: 'x-belast', kind: 'cross', label: 'Box 3/Box 1' },
    { from: 'k02', to: 'x-belast', kind: 'cross' },
    { from: 'k12', to: 'x-belast', kind: 'cross' },
    { from: 'k10', to: 'x-toek', kind: 'cross' },
    { from: 'k13', to: 'x-toek', kind: 'cross' },
    { from: 'k18', to: 'x-ovz', kind: 'cross' },

    // consistentie-toetsen → oppervlakken/doorwerking
    { from: 'k01', to: 'k22' },
    { from: 'k01', to: 'k21' },
    { from: 'k01', to: 'k23' },
    { from: 'k06', to: 'k23' },
    { from: 'k06', to: 'k16' },
    { from: 'k08', to: 'k21' },
    { from: 'k08', to: 'k11' },
    { from: 'k11', to: 'k16' },
    { from: 'k13', to: 'k16' },
    { from: 'k09', to: 'k19', kind: 'branch', label: 'perspectief' },
    { from: 'k20', to: 'k17' },
    { from: 'k20', to: 'k22' },

    // oppervlakken ← cross-domeinen
    { from: 'k22', to: 'x-rapp', kind: 'cross' },
    { from: 'k19', to: 'x-mijn', kind: 'cross' },
    { from: 'k23', to: 'x-will', kind: 'cross' },
    { from: 'k24', to: 'x-nav', kind: 'cross' },
    { from: 'k21', to: 'k24' },

    // AI-tier-gate (eigen tak vanuit de SSoT/AI-oppervlakken)
    { from: 'ssot', to: 'k25' },
    { from: 'k23', to: 'k25', kind: 'branch', label: 'AI-oppervlak' },
    { from: 'k25', to: 'x-will', kind: 'cross' },
    { from: 'k25', to: 'x-rapp', kind: 'cross' },
    { from: 'k25', to: 'x-reken', kind: 'cross' },

    // volledige gebruikersreis
    { from: 'x-start', to: 'k26', kind: 'cross' },
    { from: 'ssot', to: 'k26' },

    // samenvloeien → uitkomst
    { from: 'k16', to: 'consistent' },
    { from: 'k17', to: 'consistent' },
    { from: 'k19', to: 'consistent' },
    { from: 'k21', to: 'consistent' },
    { from: 'k22', to: 'consistent' },
    { from: 'k23', to: 'consistent' },
    { from: 'k24', to: 'consistent' },
    { from: 'k25', to: 'consistent' },
    { from: 'k26', to: 'consistent' },
  ],
}

// ── Aandachtspunten op de architectuur (gecureerd) ───────────────────────────
// Bekende schuld, drift en risico's, verankerd op de elementen waar ze spelen.
// Eén oogopslag op de plaat: wáár zit de spanning. Houd dit bij wanneer je een
// punt oplost (verwijderen) of er een nieuw structureel risico ontstaat.
//
// severity:
//   info  — bewuste situatie, geen actie nodig (bv. legacy-route die nog leeft)
//   debt  — technische schuld; opruimen levert onderhoudswinst
//   risk  — kan tot verkeerde uitkomsten of datalekken leiden; prioriteit

import type { ArchimateModel } from './archimate-model'

export type ArchiConcernSeverity = 'info' | 'debt' | 'risk'

export interface ArchiConcern {
  id: string
  title: string
  detail: string
  severity: ArchiConcernSeverity
  /** Element-id's waarop dit punt slaat */
  elementIds: string[]
}

export const ARCHI_CONCERNS: ArchiConcern[] = [
  {
    id: 'whatif-unified',
    title: 'WhatIf nog niet op de unified projection',
    detail:
      '/toekomst draait op runUnifiedProjection, maar de losse what-if-doorrekening gebruikt nog een eigen pad. Risico op uiteenlopende FIRE-uitkomsten tussen de tijdas en de wat-als.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
  {
    id: 'legacy-backing-routes',
    title: 'Legacy backing-routes blijven leven',
    detail:
      'De canonieke navigatie is /overzicht · /toekomst · /mijn, maar /core · /will · /horizon · /identity bestaan nog als backing-routes. Bewust, maar dubbele paden vergroten de kans op drift.',
    severity: 'info',
    elementIds: ['app-comp'],
  },
  {
    id: 'better-auth-scaffolding',
    title: 'Vermoedelijk dode better-auth-scaffolding',
    detail:
      'Supabase Auth is canoniek (RLS op auth.uid()). De better-auth-resten in src/lib zijn waarschijnlijk dood; opruimen voorkomt verwarring over welk auth-model geldt.',
    severity: 'debt',
    elementIds: ['t-supabase'],
  },
  {
    id: 'nav-shell-cleanup',
    title: 'Navigatie-redesign — fase 4 cleanup openstaand',
    detail:
      'De nieuwe sidebar/mobile-shell staat achter feature-flag new_navigation_shell. Fase 0-3 zijn af; de opruimfase (oude shell verwijderen) loopt nog.',
    severity: 'debt',
    elementIds: ['app-comp'],
  },
  {
    id: 'horizon-engine-v2-duaal',
    title: 'v2 is de enige FIRE-engine; v1 = niet-FIRE-rekenbibliotheek',
    detail:
      'Cutover C4 voltooid (ADR 0013/0016): lib/horizon-engine/ (v2, reëel grootboek) is de ENIGE engine die FIRE-cijfers produceert — alle FIRE-oppervlakken (/toekomst, /overzicht, /core, AI-context, freedomPct/gezondheidsscore/sovereignty, what-if, regel-sim, AOW/Pensioen-previews) lopen via runSelectedProjection(input, isHorizonV2Enabled(profile), options). lib/unified-projection.ts (runUnifiedProjection) en runSimulation blijven bewust bestaan als NIET-FIRE-rekenbibliotheek: fee-analyse, hypotheek-vs-beleggen, household-projection, de housing-trigger-meetrun en de accumulation-only Kern-prognose. Geen driftrisico meer op FIRE (één bron = LedgerRow[]; adapter is het enige reëel→nominaal-punt; FIRE = forward doel-zoektocht). Architectuur + invarianten: docs/architecture/horizon-engine-v2.md.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
  {
    id: 'horizon-god-component',
    title: 'horizon-client.tsx is een god-component',
    detail:
      'Eén client van ~6900 regels draagt /toekomst zonder eigen tests. Decompositie loopt (stap 1 HorizonTrendGrid klaar); tot dan is dit het grootste wijzigingsrisico van de app.',
    severity: 'debt',
    elementIds: ['fn-toekomstplannen', 'as-planning'],
  },
  {
    id: 'checkin-island',
    title: 'Check-in rekent op een eigen eiland',
    detail:
      'De check-in gebruikt SWR 4%, “deze maand” en ongewogen vermogen, terwijl de rest op resolveFireParams + gewogen vermogen draait. Inconsistente kerngetallen tussen check-in en dashboard.',
    severity: 'risk',
    elementIds: ['as-coach', 'as-planning'],
  },
  {
    id: 'tz-month-boundaries',
    title: 'Tijdzone-onveilige maandgrenzen',
    detail:
      '~15 call-sites bouwen maandgrenzen met toISOString() i.p.v. localMonthBounds(); in NL schuift dat een dag terug en lekt vorige-maand-salaris in de totalen. Gebruik lib/month-range.ts.',
    severity: 'risk',
    elementIds: ['as-budget', 'as-import'],
  },
  {
    id: 'migration-drift',
    title: 'Supabase migratie-drift',
    detail:
      'De lokale supabase/migrations-map loopt niet gelijk met remote. DDL via apply_migration; check kolommen/functies vóór je erop bouwt, anders bouw je op een schema dat remote niet bestaat.',
    severity: 'risk',
    elementIds: ['t-supabase', 'data-cont'],
  },
]

/** Aandachtspunten die een specifiek element raken. */
export function getConcernsFor(elementId: string): ArchiConcern[] {
  return ARCHI_CONCERNS.filter((c) => c.elementIds.includes(elementId))
}

/** Telling per element, voor badges op de plaat. */
export function concernCountByElement(): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of ARCHI_CONCERNS) {
    for (const id of c.elementIds) map.set(id, (map.get(id) ?? 0) + 1)
  }
  return map
}

/** Valideert dat elk aandachtspunt naar bestaande elementen verwijst. */
export function validateConcerns(model: ArchimateModel): string[] {
  const ids = new Set(model.nodes.map((n) => n.id))
  const errors: string[] = []
  const seen = new Set<string>()
  for (const c of ARCHI_CONCERNS) {
    if (seen.has(c.id)) errors.push(`dubbel concern-id: ${c.id}`)
    seen.add(c.id)
    if (c.elementIds.length === 0) errors.push(`concern ${c.id} heeft geen elementen`)
    for (const e of c.elementIds) if (!ids.has(e)) errors.push(`concern ${c.id} verwijst naar onbekend element ${e}`)
  }
  return errors
}

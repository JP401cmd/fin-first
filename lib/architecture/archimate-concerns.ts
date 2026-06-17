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
    id: 'public-intake-write',
    title: 'Eerste publieke service-role-schrijfpad',
    detail:
      'De Vrijheidscheck-funnel laat een anonieme bezoeker (geen auth.uid()) server-side wegschrijven naar lead_intakes — het eerste publieke schrijfpad dat via de service-role RLS omzeilt. De vangrails (zod + payload-grens + IP-rate-limit + Turnstile, fail-closed) zijn ontworpen en security gaf een voorwaardelijke GO, maar de migratie/secrets zijn nog niet uitgerold. Tot de hardening getest én gedeployed is, blijft dit het scherpste structurele risico. Verwijder dit punt zodra deploy + GO rond zijn.',
    severity: 'risk',
    elementIds: ['as-vrijheidscheck', 't-supabase', 'do-lead'],
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

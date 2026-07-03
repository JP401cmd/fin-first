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
  {
    id: 'deplete-doel-lijn-grondslag',
    title: 'Doel-lijn (V_nodig) is liquide; getekende curve is netto vermogen',
    detail:
      'ERFT NAAR DE KERNEL (ADR 0032). De horizontale doel-lijn op /toekomst is gebaseerd op het liquide vermogen (kernel: Prognose!J, het B36-doelbedrag in het solver-statusblok), terwijl de getekende hoofdcurve het netto vermogen weergeeft (Prognose!I, inclusief eigen woning). Voor accounts met een groot niet-liquide eigen huis (netto >> liquide) blijft een zichtbare afstand tussen de FIRE-stip en de doel-lijn bestaan: de spanning is structureel gelijk aan onder de verwijderde v2-engine (V_nodig vs netto vermogen) — twee opties nog open (aparte liquide-curve tekenen, of een hellende doel-lijn). Verwijder zodra dat besluit genomen en doorgevoerd is. NB: de reverse_mortgage-desync (display vs engine op leenruimte-grondslag) is beslist via ADR 0029; de downsize-eligibility-desync die v2 had is met de kernel-migratie vervallen (kernel behandelt het huis pas ná verkoop als liquide, net als de display-helper — zie calc "Vrijheidsvoortgang").',
    severity: 'info',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
  {
    id: 'horizon-kernel-bekende-afwijkingen',
    title: 'Horizon-kernel: drie bekende, bewuste grenzen/afwijkingen t.o.v. het Excel-oracle',
    detail:
      'Drie structurele kanttekeningen bij de horizon-kernel (ADR 0032), geen bugs maar wel aandachtspunten. (1) B93 reached_now-quirk: bij een doelbedrag van €0 (bv. legacy-nalatenschap €0, of deplete zonder expliciet doel) geeft het solver-statusblok altijd status reached_now zodra Prognose!J(0) ≥ 0 — letterlijke Excel-parity, maar mogelijk verwarrend als UI-tekst ("je kunt nu al stoppen" bij een leeg doel). Nog geen apart gap-besluit genomen (docs/horizon-excel-oracle-plan.md §V12). (2) De scenario-band/Monte-Carlo-wrappers (lib/horizon-kernel/wrappers/band.ts, wrappers/mc.ts) leveren uitsluitend SCALAIRE uitkomsten per scenario (fireAge, netto-vermogen-bij-FIRE, netto-liquide-bij-eindleeftijd — de Sim!B/C/D-rij) — geen volledige per-jaar LedgerRow-achtige asset-/schuld-/onttrekkingsbreakdown per scenario. Een toekomstige UI die per-scenario samenstelling wil tonen (net als de hoofdgrafiek) vindt die breakdown niet; dat vereist een aparte volledige kernel-run per scenario. (3) Lege-surplus-doelpot-divergentie (gap-besluit V17, eigenaar 2026-07-03): staat de surplus-doelpot op €0, dan laat het Excel-oracle het maandspaar VERDAMPEN (Σgewicht=0 → inleg €0), terwijl de kernel via de bewuste degeneratie-fallback (toenameGewichten tak A) het spaargeld wél in de lege pot stort — bij het eigenaar-account het verschil tussen FIRE 59,58 (kernel) en 89,33 (Excel, zelfde invoer; end-to-end-verificatie scripts/horizon-oracle/*eigenaar-live*). De kernel-extensie is de gewenste semantiek; definitieve borging = Excel v6 fixen + fixtures herextraheren (eigenaar-actie); tot die tijd bewaken surplus-/withdrawal-evaporation-tests het kernel-gedrag en mag deze divergentie NIET "richting oracle" worden weggefixt zonder nieuw eigenaar-besluit.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
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
